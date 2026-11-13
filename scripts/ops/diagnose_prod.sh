#!/bin/bash
# Pass 6 — S3 after the IAM policy (test object is deleted afterwards).
B=https://muktasabat.com
docker exec muktasabat-api-1 python -c "
import io, os, boto3
s3=boto3.client('s3', region_name=os.environ.get('S3_REGION')); b=os.environ['S3_BUCKET']
for name, fn in [('head_bucket', lambda: s3.head_bucket(Bucket=b) and 'OK'), ('location', lambda: s3.get_bucket_location(Bucket=b).get('LocationConstraint'))]:
    try: print('s3', name, ':', fn())
    except Exception as e: print('s3', name, ':', type(e).__name__, str(e)[:200])
from api import storage
o=storage.upload_image(io.BytesIO(bytes.fromhex('89504e470d0a1a0a')), content_type='image/png', prefix='diag')
print('KEY', o.object_key); print('URL', o.public_url)
local=(storage.local_upload_root()/o.object_key).is_file()
print('stored on:', 'LOCAL DISK (S3 still failing)' if local else 'S3')
" 2>&1 | grep -vE '^\s' > /tmp/s3.txt
cat /tmp/s3.txt | grep -v '^KEY'
KEY=$(grep '^KEY' /tmp/s3.txt | cut -d' ' -f2)
echo "served via site: $(curl -s -o /dev/null -w '%{http_code} %{content_type}' $B/uploads/$KEY)"
echo "direct S3 public URL blocked (bucket private): $(curl -s -o /dev/null -w '%{http_code}' https://muktasabat-uploads.s3.ap-south-1.amazonaws.com/$KEY)"
docker exec muktasabat-api-1 python -c "from api import storage; storage.delete_object('$KEY'); print('deleted test object')"
docker exec muktasabat-api-1 rm -rf /app/uploads/diag
