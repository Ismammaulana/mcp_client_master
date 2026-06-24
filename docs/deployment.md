# Deployment

## Preflight

Sebelum deploy:

```bash
npm ci --no-audit --no-fund
npm run check
npm run test:contract
npm audit --audit-level=high
```

Konfirmasi keputusan environment:

- URL dan routing MCP.
- Kebutuhan custom Host header.
- API key dari secret manager.
- Final tool allowlist.
- Timeout dan concurrency berdasarkan kapasitas upstream.
- Reverse proxy/TLS dan akses `/health` legacy.

## Menjalankan process Node

```bash
NODE_ENV=production npm start
```

Entrypoint adalah `src/server.js`. Jangan memakai `npm run dev` pada production.
Process harus dijalankan oleh supervisor yang mengirim SIGTERM dan memberi grace
period cukup.

## Docker image

Build:

```bash
docker build --pull -t mcp-client-master-gateway:1.0.0 .
```

Run:

```bash
docker run --rm \
  --name mcp-client-master-gateway \
  --read-only \
  --security-opt no-new-privileges \
  --tmpfs /tmp \
  --env-file /secure/path/mcp-gateway.env \
  -p 9100:9100 \
  mcp-client-master-gateway:1.0.0
```

Dockerfile:

- memakai dependency stage dengan `npm ci --omit=dev`;
- final image hanya membawa production dependency dan source;
- berjalan sebagai user `node`, bukan root;
- menyediakan liveness healthcheck;
- tidak menyalin `.env`, test, `.git`, atau local `node_modules`.

Setelah build, verifikasi:

```bash
docker inspect --format '{{.Config.User}}' mcp-client-master-gateway:1.0.0
docker run --rm mcp-client-master-gateway:1.0.0 node --version
```

Host yang tidak memiliki Docker/Podman/Buildah tidak dapat membuktikan image build;
validasi file saja bukan pengganti runtime test.

## Docker Compose

```bash
export API_KEY='<secret>'
export MCP_SERVER_URL='http://host.docker.internal:9200/mcp'
docker compose -f deploy/docker-compose.yml config
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
```

Compose tidak menjalankan MCP server karena upstream berada di luar scope proyek.
`API_KEY` wajib pada Compose.

Lihat log dan readiness:

```bash
docker compose -f deploy/docker-compose.yml logs --tail=100 -f
curl -H "x-api-key: $API_KEY" http://127.0.0.1:9100/health/ready
```

## Systemd

### User dan file

```bash
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin mcp-gateway
sudo chown -R root:root /opt/CLIENT_MASTER/mcp_client_master_gateway
sudo chmod -R go-w /opt/CLIENT_MASTER/mcp_client_master_gateway
sudo install -m 0644 deploy/mcp-client-master-gateway.service \
  /etc/systemd/system/mcp-client-master-gateway.service
sudo install -m 0640 -o root -g mcp-gateway /secure/path/mcp-gateway.env \
  /etc/mcp-client-master-gateway.env
```

Install dependency production:

```bash
cd /opt/CLIENT_MASTER/mcp_client_master_gateway
sudo npm ci --omit=dev --no-audit --no-fund
```

Validasi dan start:

```bash
sudo systemd-analyze verify /etc/systemd/system/mcp-client-master-gateway.service
sudo systemctl daemon-reload
sudo systemctl enable --now mcp-client-master-gateway
sudo systemctl status mcp-client-master-gateway
journalctl -u mcp-client-master-gateway -f
```

Unit menerapkan `NoNewPrivileges`, private tmp, read-only system protection, kernel
protection, restart-on-failure, dan SIGTERM stop.

## Reverse proxy

Production sebaiknya menempatkan gateway di belakang TLS reverse proxy. Proxy harus:

- membatasi request body maksimal sama atau lebih kecil dari gateway;
- menjaga `x-request-id` atau menghasilkan nilai baru;
- tidak mencatat `x-api-key`;
- menerapkan distributed rate limit bila beberapa replica;
- membatasi akses `/metrics` dan `/health` legacy;
- menggunakan trusted upstream network;
- meneruskan status 502/503/504 tanpa mengubah error body sembarang.

Gateway belum mengaktifkan `trustProxy`; jangan membuat security decision berdasarkan
client IP Fastify di belakang proxy sebelum konfigurasi proxy disepakati dan diuji.

## Rolling deployment

1. Deploy satu canary replica.
2. Pastikan `/health/live` 200.
3. Pastikan authenticated `/health/ready` 200.
4. Periksa error rate dan upstream latency.
5. Jalankan satu read-only/safe tool smoke test bila tersedia.
6. Lanjutkan replica lain secara bertahap.
7. Pertahankan image/tag sebelumnya untuk rollback.

Jangan memakai mutating tool sebagai smoke test tanpa idempotency guarantee.

## Rollback

Gateway tidak memiliki database atau migrasi state. Rollback:

1. Hentikan rollout.
2. Jalankan image/package versi sebelumnya.
3. Pertahankan konfigurasi yang kompatibel dengan versi tersebut.
4. Periksa live/ready, error rate, dan satu safe tool call.
5. Catat penyebab rollback dan update changelog/incident record.

Perubahan API atau environment variable tetap dapat membuat rollback tidak kompatibel;
setiap release harus mendokumentasikan hal tersebut.

## Kubernetes

Manifest Kubernetes belum disediakan. Bila dibuat, gunakan:

- liveness `/health/live` tanpa auth;
- readiness `/health/ready` dengan mekanisme credential yang tidak terekspos pada
  manifest/log probe;
- Secret untuk API key;
- termination grace period lebih besar dari request timeout;
- non-root, read-only filesystem, seccomp, dropped capabilities;
- PodDisruptionBudget dan resource requests/limits berdasarkan load test.

Penambahan Kubernetes memerlukan artefak, docs, test manifest, dan ADR deployment.
