from pinecone import Pinecone, ServerlessSpec


class PineconeSearch:
    def __init__(self, api_key: str, index_name: str):
        self.pc = Pinecone(api_key=api_key)
        self.index_name = index_name
        self.index = None

    def ensure_index_exists(self, dimension: int):
        existing = [idx.name for idx in self.pc.list_indexes()]
        if self.index_name not in existing:
            self.pc.create_index(
                name=self.index_name,
                dimension=dimension,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        self.index = self.pc.Index(self.index_name)

    def connect(self):
        self.index = self.pc.Index(self.index_name)

    def upsert(self, vectors: list[dict], batch_size: int = 100):
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i : i + batch_size]
            self.index.upsert(vectors=batch, namespace="sections")

    def search(self, query_vector: list[float], top_k: int = 10,
               filter: dict = None) -> list[dict]:
        results = self.index.query(
            vector=query_vector,
            top_k=top_k,
            namespace="sections",
            include_metadata=True,
            filter=filter,
        )
        return [
            {"id": m.id, "score": m.score, **(m.metadata or {})}
            for m in results.matches
        ]

    def delete_by_doc(self, doc_id: str):
        self.index.delete(filter={"doc_id": doc_id}, namespace="sections")
