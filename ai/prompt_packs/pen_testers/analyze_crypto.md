---
id: analyze_crypto
name: Pentest Cryptographic Weakness Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Cryptographic Weakness Analysis

## Objective

Identify weak cryptographic primitives, hardcoded secrets, insecure randomness, JWT misconfigurations, and TLS weaknesses that allow practical attacks — key recovery, token forgery, secret extraction, or downgrade.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. **Weak algorithms**: scan for use of MD5 or SHA-1 in security-relevant contexts (password hashing, HMAC, digital signatures, certificate fingerprinting). Flag DES, 3DES, RC4, ECB mode for any cipher. Flag RSA keys < 2048 bits and elliptic curves weaker than P-256.
2. **Password hashing**: confirm passwords are hashed with bcrypt, Argon2, scrypt, or PBKDF2. Flag MD5, SHA-1, SHA-256, or unsalted hashes used for passwords.
3. **Hardcoded secrets**: scan source, config files, `.env` files, CI/CD configs, and infrastructure-as-code for API keys, signing keys, database credentials, OAuth secrets, certificate private keys, and seed phrases. Include Base64-encoded blobs that decode to key material.
4. **Insecure randomness**: find `Math.random()`, `random.random()`, `rand()`, `/dev/urandom` read without proper seeding used for tokens, session IDs, CSRF tokens, password reset codes, or cryptographic nonces.
5. **JWT misconfigurations**:
   - `alg: none` acceptance.
   - Symmetric HS256 key used as a public key (RS256 → HS256 confusion).
   - Weak or guessable signing secret (common wordlist candidates).
   - Missing `exp` claim or excessively long expiry.
   - `kid` header injection into SQL/file path sinks.
   - Missing `aud` or `iss` validation.
6. **Encryption at rest**: identify sensitive data stored in databases, files, or object storage without encryption. Flag fields like `password_hash`, `ssn`, `credit_card`, `api_key`, `private_key` stored as plaintext.
7. **TLS configuration**: check for `TLS_1_0`, `TLS_1_1`, `SSLv3` acceptance, self-signed certificates accepted in production HTTP clients, `verify=False` / `InsecureSkipVerify`, weak cipher suite preference (RC4, NULL, EXPORT, ANON suites).
8. **Nonce/IV reuse**: find deterministic IVs for AES-CBC/GCM — zero IVs, counter-based IVs shared across keys, or IVs derived from non-random sources.

## Output Files

- `Docs/reviews/pentest/<run_id>/crypto_analysis.md`
- `Docs/reviews/pentest/<run_id>/crypto_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "CRYPTO-001",
      "class": "weak_algorithm|hardcoded_secret|insecure_random|jwt_misconfiguration|missing_encryption_at_rest|weak_tls|iv_reuse|weak_password_hash",
      "location": "path/file.ext:line",
      "primitive": "MD5|SHA1|DES|Math.random|HS256|TLS1.0|AES-ECB|etc.",
      "usage_context": "password_hash|token_generation|session_id|signing|data_encryption",
      "secret_exposed": "yes|no|partial",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
