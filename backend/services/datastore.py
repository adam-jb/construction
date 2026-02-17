import json
import io
import boto3
from botocore.exceptions import ClientError


STORE_NAMES = ["sections", "references", "precedence", "kv_store",
               "documents", "formulae", "objects"]


class DataStore:
    """All dictionaries, backed by JSON files in R2."""

    def __init__(self, r2_url: str, access_key: str, secret_key: str, bucket: str):
        self.s3 = boto3.client(
            "s3",
            endpoint_url=r2_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        self.bucket = bucket
        self.sections: dict = {}
        self.references: dict = {}
        self.precedence: dict = {}
        self.kv_store: dict = {}
        self.documents: dict = {}
        self.formulae: dict = {}
        self.objects: dict = {}

    def load_all(self):
        for name in STORE_NAMES:
            try:
                obj = self.s3.get_object(Bucket=self.bucket, Key=f"datastore/{name}.json")
                setattr(self, name, json.loads(obj["Body"].read()))
            except ClientError as e:
                if e.response["Error"]["Code"] == "NoSuchKey":
                    pass  # empty dict is fine
                else:
                    raise

    def save(self, name: str):
        data = json.dumps(getattr(self, name), ensure_ascii=False)
        self.s3.put_object(
            Bucket=self.bucket,
            Key=f"datastore/{name}.json",
            Body=data.encode(),
            ContentType="application/json",
        )

    def save_all(self):
        for name in STORE_NAMES:
            self.save(name)

    def upload_file(self, key: str, data: bytes, content_type: str = "application/octet-stream"):
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def download_file(self, key: str) -> bytes:
        obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        return obj["Body"].read()
