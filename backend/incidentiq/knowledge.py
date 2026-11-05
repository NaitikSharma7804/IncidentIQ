"""Knowledge retrieval and document RAG service.
Deterministic embedding and honest in-process similarity search with SQLite fallback.
"""
import hashlib
import math
import os
import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from .models import KnowledgeChunk, KnowledgeDocument


# Embedding provider abstraction
class EmbeddingProvider:
    def __init__(self):
        self._mode = "tfidf_fallback"
        self._st_model = None
        # Try local SentenceTransformer if installed, otherwise gracefully fallback to TF-IDF
        try:
            from sentence_transformers import SentenceTransformer
            self._st_model = SentenceTransformer("all-MiniLM-L6-v2")
            self._mode = "sentence_transformers"
        except Exception:
            self._mode = "tfidf_fallback"

    @property
    def mode(self) -> str:
        return self._mode

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self._mode == "sentence_transformers" and self._st_model is not None:
            vectors = self._st_model.encode(texts, convert_to_numpy=True)
            return [v.tolist() for v in vectors]
        return [self._tfidf_vector(t) for t in texts]

    def _tfidf_vector(self, text: str, dim: int = 1024) -> list[float]:
        """Deterministic term-frequency hash projection with L2 normalization."""
        tokens = re.findall(r"\b[a-zA-Z0-9_\-]{3,}\b", text.lower())
        vec = [0.0] * dim
        if not tokens:
            return vec
        for tok in tokens:
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest()[:8], 16)
            idx = h % dim
            vec[idx] += 1.0
        # L2 normalize
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [round(x / norm, 6) for x in vec]
        return vec


embedding_provider = EmbeddingProvider()


def get_active_vector_backend(db_url: str) -> str:
    """Honest description of active vector store."""
    if db_url.startswith("postgresql") and "pgvector" in db_url:
        return "pgvector_postgresql"
    return f"in_process_cosine_similarity_{embedding_provider.mode}"


def cosine_similarity(v1: list[float], v2: list[float]) -> float:
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def chunk_markdown(content: str, max_chunk_words: int = 150, overlap_words: int = 30) -> list[dict[str, Any]]:
    """Chunks markdown by header section and word window with overlap."""
    sections = re.split(r"(^##\s+[^\n]+)", content, flags=re.MULTILINE)
    chunks = []
    current_section = "General"

    buffer = ""
    for part in sections:
        part_clean = part.strip()
        if not part_clean:
            continue
        if part_clean.startswith("## "):
            current_section = part_clean.replace("## ", "").strip()
            continue

        words = part_clean.split()
        if len(words) <= max_chunk_words:
            chunks.append({"section": current_section, "content": part_clean})
        else:
            step = max_chunk_words - overlap_words
            for i in range(0, len(words), step):
                chunk_text = " ".join(words[i : i + max_chunk_words])
                if chunk_text:
                    chunks.append({"section": current_section, "content": chunk_text})

    return chunks


def ingest_document(
    db: Session,
    filename: str,
    title: str,
    content: str,
    doc_type: str = "runbook",
    service: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> KnowledgeDocument:
    """Idempotently ingests or updates a document and its vector chunks."""
    existing_doc = db.query(KnowledgeDocument).filter_by(filename=filename).first()
    if existing_doc:
        doc = existing_doc
        doc.title = title
        doc.content = content
        doc.doc_type = doc_type
        doc.service = service
        doc.doc_metadata = metadata or {}
        # Clear existing chunks for clean re-ingestion
        db.query(KnowledgeChunk).filter_by(document_id=doc.id).delete()
    else:
        doc = KnowledgeDocument(
            id=str(uuid.uuid4()),
            filename=filename,
            title=title,
            content=content,
            doc_type=doc_type,
            service=service,
            doc_metadata=metadata or {},
        )
        db.add(doc)
    db.flush()

    raw_chunks = chunk_markdown(content)
    if raw_chunks:
        texts = [c["content"] for c in raw_chunks]
        embeddings = embedding_provider.embed(texts)
        filename_slug = re.sub(r"[^a-zA-Z0-9_\-]", "_", os.path.splitext(filename)[0])
        for idx, (c_data, emb) in enumerate(zip(raw_chunks, embeddings)):
            chunk_rec = KnowledgeChunk(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                chunk_id=f"chk-{filename_slug}-{idx:02d}",
                chunk_index=idx,
                section=c_data["section"],
                content=c_data["content"],
                embedding_json=emb,
            )
            db.add(chunk_rec)

    db.commit()
    db.refresh(doc)
    return doc


def ingest_runbooks_directory(db: Session, runbooks_dir: str = "data/runbooks") -> int:
    if not os.path.exists(runbooks_dir):
        return 0
    count = 0
    for fname in os.listdir(runbooks_dir):
        if fname.endswith(".md"):
            fpath = os.path.join(runbooks_dir, fname)
            with open(fpath, encoding="utf-8") as f:
                content = f.read()

            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            title = title_match.group(1).strip() if title_match else fname

            # Extract affected services if listed in runbook
            service_match = re.search(r"## Affected Services\s*\n((?:-\s*[\w\-]+\s*\n)+)", content)
            service = None
            if service_match:
                services = [s.strip().lstrip("-").strip() for s in service_match.group(1).strip().split("\n")]
                if services:
                    service = services[0]

            ingest_document(
                db=db,
                filename=fname,
                title=title,
                content=content,
                doc_type="runbook" if "runbook" in fname.lower() else "architecture",
                service=service,
                metadata={"source_path": fpath},
            )
            count += 1
    return count


def search_knowledge(
    db: Session,
    query: str,
    top_k: int = 3,
    similarity_threshold: float = 0.05,
    service_filter: str | None = None,
    doc_type_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Retrieves relevant knowledge chunks with stable evidence IDs and metadata."""
    if not query.strip():
        return []

    # Strip any potential prompt injection delimiter tokens from query
    clean_query = query.replace("```", "").replace("<|", "").replace("|>", "")
    query_vector = embedding_provider.embed([clean_query])[0]

    q = db.query(KnowledgeChunk).join(KnowledgeDocument)
    if service_filter:
        q = q.filter(KnowledgeDocument.service == service_filter)
    if doc_type_filter:
        q = q.filter(KnowledgeDocument.doc_type == doc_type_filter)

    candidates = q.all()
    scored = []
    for chk in candidates:
        if not chk.embedding_json:
            continue
        sim = cosine_similarity(query_vector, chk.embedding_json)
        if sim >= similarity_threshold:
            scored.append((sim, chk))

    scored.sort(key=lambda x: -x[0])
    results = []
    for sim, chk in scored[:top_k]:
        doc = chk.document
        # Format as strict untrusted knowledge evidence
        results.append(
            dict(
                id=f"ev:{chk.chunk_id}",
                evidence_id=f"ev:{chk.chunk_id}",
                source_type="knowledge",
                source_record_id=chk.chunk_id,
                service=doc.service,
                document_title=doc.title,
                document_filename=doc.filename,
                section=chk.section,
                similarity_score=round(float(sim), 4),
                excerpt=chk.content[:400],
                full_content=chk.content,
            )
        )
    return results
