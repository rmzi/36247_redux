#!/usr/bin/env python3
"""
36247 Cookie Deployer

Generates signed cookies and deploys an auth page with them embedded.
"""

import argparse
import base64
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

# Configuration
AWS_PROFILE = os.environ.get('AWS_PROFILE', 'personal')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
SECRET_NAME = '36247-cloudfront-signing-key'
DOMAIN = '36247.rmzi.world'
SITE_BUCKET = '36247-site.rmzi.world'
CLOUDFRONT_DISTRIBUTION_ID = 'E3SAK6ILUR5289'


def get_signing_key():
    """Fetch signing key from Secrets Manager."""
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    client = session.client('secretsmanager')
    response = client.get_secret_value(SecretId=SECRET_NAME)
    secret = json.loads(response['SecretString'])
    return secret['private_key'], secret['key_pair_id']


def rsa_sign(message: bytes, private_key_pem: str) -> bytes:
    """Sign a message using RSA-SHA1 (required by CloudFront)."""
    private_key = serialization.load_pem_private_key(
        private_key_pem.encode(),
        password=None,
        backend=default_backend()
    )
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())


def make_cloudfront_safe(s: str) -> str:
    """Make base64 string safe for CloudFront cookies."""
    return s.replace('+', '-').replace('=', '_').replace('/', '~')


def generate_signed_cookies(key_pair_id: str, private_key_pem: str, hours: int) -> dict:
    """Generate CloudFront signed cookies."""
    expires = datetime.now(timezone.utc) + timedelta(hours=hours)
    resource = f"https://{DOMAIN}/*"

    policy = {
        "Statement": [{
            "Resource": resource,
            "Condition": {
                "DateLessThan": {
                    "AWS:EpochTime": int(expires.timestamp())
                }
            }
        }]
    }

    policy_json = json.dumps(policy, separators=(',', ':'))
    policy_b64 = make_cloudfront_safe(base64.b64encode(policy_json.encode()).decode())

    signature = rsa_sign(policy_json.encode(), private_key_pem)
    signature_b64 = make_cloudfront_safe(base64.b64encode(signature).decode())

    return {
        'CloudFront-Policy': policy_b64,
        'CloudFront-Signature': signature_b64,
        'CloudFront-Key-Pair-Id': key_pair_id
    }, expires


def main():
    parser = argparse.ArgumentParser(description='Deploy auth page with fresh signed cookies')
    parser.add_argument('--hours', type=int, default=8760, help='Cookie validity in hours (default: 8760 = 1 year)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deployed without deploying')
    args = parser.parse_args()

    # Get signing key
    print("Fetching signing key from Secrets Manager...")
    private_key, key_pair_id = get_signing_key()

    # Generate cookies
    print(f"Generating cookies valid for {args.hours} hours...")
    cookies, expires = generate_signed_cookies(key_pair_id, private_key, args.hours)

    print(f"Cookies valid until: {expires.isoformat()}")

    # Read main.js template
    script_dir = Path(__file__).parent
    main_js_path = script_dir.parent / 'www' / 'main.js'

    with open(main_js_path) as f:
        js = f.read()

    # Embed cookies
    cookies_js = json.dumps(cookies, indent=2)
    js = re.sub(
        r'const SIGNED_COOKIES = null;',
        f'const SIGNED_COOKIES = {cookies_js};',
        js
    )

    if args.dry_run:
        print("\n[DRY RUN] Would deploy main.js with cookies:")
        print(f"  Expires: {expires.isoformat()}")
        print(f"  Key-Pair-Id: {key_pair_id}")
        return 0

    # Upload to S3
    print("Uploading main.js to S3...")
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    s3 = session.client('s3')

    s3.put_object(
        Bucket=SITE_BUCKET,
        Key='main.js',
        Body=js,
        ContentType='application/javascript',
        CacheControl='no-cache, no-store, must-revalidate'
    )

    # Invalidate CloudFront cache
    print("Invalidating CloudFront cache...")
    cf = session.client('cloudfront')
    cf.create_invalidation(
        DistributionId=CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch={
            'Paths': {'Quantity': 1, 'Items': ['/main.js']},
            'CallerReference': str(datetime.now(timezone.utc).timestamp())
        }
    )

    print(f"\nDone! main.js deployed with cookies.")
    print(f"  URL: https://{DOMAIN}/")
    print(f"  Valid until: {expires.isoformat()}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
