---
id: analyze_config
name: Pentest Misconfiguration Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Misconfiguration Analysis

## Objective

Sweep configuration files, HTTP response headers, and infrastructure definitions for security misconfigurations that grant unauthorized access, leak internals, or enable client-side attacks.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. **Security headers audit**: for all HTTP responses captured in recon, check for missing or misconfigured:
   - `Content-Security-Policy` — absent, `unsafe-inline`, `unsafe-eval`, wildcard sources.
   - `Strict-Transport-Security` — absent, `max-age` < 1 year, missing `includeSubDomains`.
   - `X-Frame-Options` or `frame-ancestors` CSP directive — absent (clickjacking).
   - `X-Content-Type-Options: nosniff` — absent.
   - `Referrer-Policy` — absent or `unsafe-url`.
   - `Permissions-Policy` — absent.
   - `Cache-Control` on authenticated responses — missing `no-store`.
2. **CORS misconfiguration**: find `Access-Control-Allow-Origin: *` on authenticated endpoints, or dynamic origin reflection without validation (`if (req.headers.origin) res.header('Access-Control-Allow-Origin', req.headers.origin)`). Confirm `Access-Control-Allow-Credentials: true` paired with wildcard or reflected origin.
3. **Debug and admin endpoints**: scan routes for `/debug`, `/actuator`, `/metrics`, `/health` (with sensitive data), `/admin`, `/phpinfo`, `/_ah/`, `/api/internal`, `/__webpack_hmr`, `/.well-known/`, `/swagger-ui`, `/graphiql`, `/graphql/playground`. Confirm which are unauthenticated.
4. **Default credentials**: identify login forms, management interfaces, and service endpoints. Check for vendor-default credentials (admin/admin, admin/password, root/root, etc.) for any framework, CMS, or middleware identified in recon.
5. **Verbose error messages**: trigger error conditions (invalid input, nonexistent resource, malformed auth token) and check whether stack traces, internal paths, library versions, database names, or environment variables are returned to the client.
6. **Directory listing**: identify web roots or static file servers where directory listing is enabled — exposed source, config, backup, or log files.
7. **Exposed sensitive files**: check for accessible `.env`, `.git/`, `.DS_Store`, `wp-config.php`, `web.config`, `appsettings.json`, `database.yml`, `.htpasswd`, backup files (`*.bak`, `*.old`, `*.orig`), and editor swap files.
8. **Infrastructure-as-code**: scan Terraform, CloudFormation, Kubernetes manifests, Docker Compose files for open security groups (`0.0.0.0/0` ingress), public S3 buckets, disabled encryption, privileged containers, mounted host paths, and hardcoded secrets.
9. **Cookie flags**: confirm session and auth cookies have `Secure`, `HttpOnly`, and `SameSite=Strict` or `Lax`.

## Output Files

- `Docs/reviews/pentest/<run_id>/config_analysis.md`
- `Docs/reviews/pentest/<run_id>/config_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "CONFIG-001",
      "class": "missing_header|cors_misconfiguration|debug_endpoint|default_credentials|verbose_errors|directory_listing|exposed_file|iac_misconfiguration|cookie_flags",
      "location": "URL or path/file.ext:line",
      "detail": "specific misconfiguration observed",
      "authenticated_required": "yes|no",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
