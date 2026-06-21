# 3-Tier Production-Ready DevOps Project on GCP GKE

A complete, production-grade reference implementation of a **3-tier web application** deployed to **Google Kubernetes Engine (GKE)** with a full DevOps platform: **Infrastructure as Code, CI/CD, GitOps, TLS, Monitoring, and Logging**.

> Stack: React + Nginx → Node.js/Express API → PostgreSQL, on a private regional GKE cluster, provisioned with Terraform, delivered via GitHub Actions + Argo CD, secured with cert-manager + Let's Encrypt, observed with Prometheus/Grafana/Loki.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Tech Stack](#tech-stack)
3. [Repository Layout](#repository-layout)
4. [The 3 Tiers](#the-3-tiers)
5. [Infrastructure (Terraform)](#infrastructure-terraform)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [GitOps with Argo CD](#gitops-with-argo-cd)
8. [TLS & Ingress](#tls--ingress)
9. [Monitoring & Logging](#monitoring--logging)
10. [Security Hardening](#security-hardening)
11. [Getting Started](#getting-started)
12. [Operations Runbook](#operations-runbook)

---

## Architecture

```
                                  ┌──────────────────────────────────────────────┐
        Developer                 │                  GitHub                        │
           │  git push            │  ┌──────────┐   ┌───────────────────────────┐ │
           └─────────────────────►│  │  Source  │──►│ GitHub Actions (CI/CD)    │ │
                                  │  └──────────┘   │  • lint/test/scan         │ │
                                  │                 │  • build & push images    │ │
                                  │                 │  • bump GitOps image tag  │ │
                                  │                 └────────────┬──────────────┘ │
                                  └──────────────────────────────┼────────────────┘
                                                                 │ push image
                                                                 ▼
                                              ┌────────────────────────────────┐
                                              │  Artifact Registry (Docker)     │
                                              └────────────────────────────────┘
        Internet (HTTPS)                                         ▲ pull
            │                                                    │
            ▼                                       ┌────────────┴───────────┐
   ┌─────────────────┐   Argo CD watches repo ─────►│   Argo CD (GitOps)     │
   │  Cloud LB +     │                              └────────────┬───────────┘
   │  Ingress-NGINX  │                                           │ sync (pull)
   │  + cert-manager │                                           ▼
   └────────┬────────┘        ┌──────────────────── GKE (private, regional) ─────────────────────┐
            │ TLS             │  namespace: tier3                                                 │
            ├────────────────►│  ┌────────────┐   ┌────────────┐   ┌───────────────────────────┐ │
            │  /  (web)       │  │  Frontend  │──►│  Backend   │──►│ PostgreSQL (StatefulSet /  │ │
            └────────────────►│  │  (Nginx)   │   │  (Node API)│   │ or Cloud SQL in prod)      │ │
               /api (api)     │  │  HPA/PDB   │   │  HPA/PDB   │   └───────────────────────────┘ │
                              │  └────────────┘   └─────┬──────┘                                 │
                              │                         │ /metrics                               │
                              │  ┌──────────────────────▼─────────────────────────────────────┐ │
                              │  │ Observability: Prometheus + Grafana + Alertmanager + Loki   │ │
                              │  └────────────────────────────────────────────────────────────┘ │
                              └───────────────────────────────────────────────────────────────────┘
```

**Flow summary**

- **Provision:** Terraform builds the VPC, private regional GKE cluster, node pool, NAT, and Artifact Registry.
- **Build (CI):** On every PR/push, GitHub Actions runs tests, security scans, and validates Kubernetes manifests.
- **Release (CD):** On merge to `main`, images are built and pushed to Artifact Registry; the GitOps overlay's image tag is bumped via a commit.
- **Deploy (GitOps):** Argo CD detects the change and pull-syncs the desired state into the cluster — no cluster credentials live in CI.
- **Expose:** Ingress-NGINX + a GCP Load Balancer route traffic; cert-manager issues and renews Let's Encrypt TLS certificates.
- **Observe:** Prometheus scrapes app/cluster metrics, Grafana visualizes, Alertmanager alerts, Loki aggregates logs.

---

## Tech Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Frontend         | React (Vite) served by Nginx (unprivileged)          |
| Backend          | Node.js 20 + Express, Prometheus client, Pino logs   |
| Database         | PostgreSQL 16 (StatefulSet demo / Cloud SQL in prod) |
| Container        | Docker (multi-stage, non-root, distroless-ish alpine)|
| Orchestration    | GKE (private, regional, VPC-native, Workload Identity)|
| IaC              | Terraform (`google` provider, remote GCS state)      |
| CI/CD            | GitHub Actions (+ Trivy, kustomize validate)         |
| GitOps           | Argo CD (app-of-overlays, auto-sync + self-heal)     |
| Ingress / TLS    | Ingress-NGINX + cert-manager + Let's Encrypt         |
| Monitoring       | kube-prometheus-stack (Prometheus, Grafana, Alertmanager) |
| Logging          | Grafana Loki + Promtail                              |
| Image Registry   | Google Artifact Registry                             |

---

## Repository Layout

```
.
├── app/
│   ├── backend/                 # Node.js API (tier 2)
│   │   ├── src/index.js         # API, health, /metrics, DB access
│   │   └── Dockerfile
│   └── frontend/                # React + Nginx (tier 1)
│       ├── src/                 # React app
│       ├── nginx.conf           # SPA + /api proxy + health
│       └── Dockerfile
├── terraform/                   # GKE, VPC, NAT, Artifact Registry, IAM
├── k8s/
│   ├── base/                    # Kustomize base (deploys, svc, ingress, netpol, HPA, PDB)
│   └── overlays/
│       ├── staging/             # 1 replica, staging host
│       └── production/          # 3 replicas, prod host (image tags bumped by CI)
├── argocd/                      # AppProject + Applications (GitOps)
├── platform/
│   ├── ingress-nginx/           # Helm values
│   ├── cert-manager/            # ClusterIssuers (prod + staging)
│   ├── monitoring/              # Prometheus values, ServiceMonitor, alerts, dashboard
│   └── logging/                 # Loki + Promtail values
├── .github/workflows/           # ci.yml, cd.yml, terraform.yml
├── scripts/bootstrap-platform.sh
├── docker-compose.yml           # Local 3-tier stack
└── Makefile
```

---

## The 3 Tiers

1. **Presentation tier — Frontend** (`app/frontend`)
   - React SPA built with Vite, served by an unprivileged Nginx on port `8080`.
   - Nginx reverse-proxies `/api` to the backend Service and serves the SPA with a history fallback.
   - Exposes `/healthz` for Kubernetes probes.

2. **Application tier — Backend** (`app/backend`)
   - Express API with endpoints: `GET/POST /api/messages`, `GET /healthz`, `GET /readyz`, `GET /metrics`.
   - Connection-pooled access to PostgreSQL; structured JSON logs (Pino); Prometheus histogram for latency.
   - `readyz` checks DB connectivity so traffic only routes when the data tier is reachable.

3. **Data tier — PostgreSQL** (`k8s/base/database.yaml`)
   - StatefulSet with a PVC for the demo. **For production, prefer Cloud SQL for PostgreSQL** via the Cloud SQL Auth Proxy + Private Service Connect, and store credentials in GCP Secret Manager / External Secrets Operator.

---

## Infrastructure (Terraform)

Located in `terraform/`. Provisions:

- **VPC** with secondary ranges for VPC-native (alias IP) pods/services.
- **Private regional GKE cluster** with Workload Identity, Shielded Nodes, release channel `REGULAR`, and master authorized networks.
- **Managed, autoscaling node pool** (auto-repair, auto-upgrade) with a **least-privilege node service account**.
- **Cloud Router + Cloud NAT** for egress from private nodes.
- **Artifact Registry** Docker repository.
- **Remote state** in a GCS bucket (`versions.tf` backend block).

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # edit project_id etc.
terraform init
terraform plan
terraform apply
```

---

## CI/CD Pipeline

Three workflows under `.github/workflows/`:

| Workflow        | Trigger                       | Responsibilities                                              |
| --------------- | ----------------------------- | ------------------------------------------------------------- |
| `ci.yml`        | PRs & pushes                  | Backend tests, frontend build, Trivy scan, `kustomize build`  |
| `cd.yml`        | Push to `main` (`app/**`)     | Build images, push to Artifact Registry, **bump GitOps tag**  |
| `terraform.yml` | Changes under `terraform/**`  | `fmt`/`validate`/`plan` on PRs, `apply` on `main`             |

- **Keyless auth:** GitHub → GCP via **Workload Identity Federation** (no long-lived JSON keys). Configure repo secrets `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT`, and variable `GCP_PROJECT_ID`.
- **Pull-based delivery:** CI never `kubectl apply`s to the cluster. It only updates Git; Argo CD applies. This keeps cluster credentials out of CI and gives a full audit trail in Git.

---

## GitOps with Argo CD

Defined in `argocd/`:

- `project.yaml` — `AppProject` restricting source repo and destination namespaces.
- `application-production.yaml` / `application-staging.yaml` — `Application`s pointing at `k8s/overlays/<env>` with `automated` sync, `prune`, `selfHeal`, and retry/backoff.

Because the CD workflow commits the new image tag to `k8s/overlays/production/kustomization.yaml`, Argo CD continuously reconciles the cluster to match Git. Drift is auto-corrected (`selfHeal`).

---

## TLS & Ingress

- **Ingress-NGINX** (`platform/ingress-nginx/values.yaml`) fronts the app via a GCP external Load Balancer, with metrics exported to Prometheus.
- **cert-manager** (`platform/cert-manager/cluster-issuer.yaml`) provides `letsencrypt-prod` and `letsencrypt-staging` `ClusterIssuer`s using HTTP-01 solvers.
- The app `Ingress` (`k8s/base/ingress.yaml`) requests a certificate via the `cert-manager.io/cluster-issuer` annotation and forces HTTPS redirects. Certificates auto-renew.

Routing: `/api` → backend Service, `/` → frontend Service, all over TLS at `app.example.com` (replace with your domain + DNS A record to the LB IP).

---

## Monitoring & Logging

**Monitoring** (`platform/monitoring/`)

- `kube-prometheus-stack` installs Prometheus, Alertmanager, and Grafana with cluster dashboards.
- `backend-servicemonitor.yaml` scrapes the backend `/metrics` and defines alerts: high 5xx rate, high p95 latency, crash-looping pods.
- `dashboards/tier3-overview.json` — request rate, p95 latency, error rate, ready replicas.

**Logging** (`platform/logging/`)

- Loki + Promtail aggregate pod logs cluster-wide; health-check noise is dropped to cut cost.
- Loki is wired as a Grafana datasource so metrics and logs share one pane of glass.

---

## Security Hardening

- Private GKE nodes, Shielded Nodes (secure boot + integrity monitoring), Workload Identity (no node key sharing).
- Least-privilege node service account; Artifact Registry read-only on nodes.
- Containers run **non-root**, `readOnlyRootFilesystem` (backend), all capabilities dropped, `allowPrivilegeEscalation: false`, `seccompProfile: RuntimeDefault`.
- **NetworkPolicies**: default-deny ingress + explicit allow (ingress→frontend, frontend→backend, backend→postgres).
- Pod Security Standards (`baseline`) on the namespace; HPA + PDB for availability.
- Secrets: committed values are **placeholders**. Use Sealed Secrets / External Secrets Operator / GCP Secret Manager in real environments. Trivy scans run in CI.

---

## Getting Started

### 1. Run locally (no cloud needed)

```bash
make dev          # docker compose: postgres + backend + frontend
# frontend → http://localhost:8081 , backend → http://localhost:8080
make test         # backend unit tests
```

### 2. Provision the cluster

```bash
# Create a GCS bucket for state, then set it in terraform/versions.tf
make tf-init tf-apply PROJECT=my-gcp-project
make creds        PROJECT=my-gcp-project   # fetch kubeconfig
```

### 3. Install the platform & deploy via GitOps

```bash
# Update image paths/repo URLs (REGION/PROJECT, github repo) in:
#   k8s/base/kustomization.yaml  and  argocd/*.yaml
make bootstrap    # ingress-nginx, cert-manager, monitoring, logging, argocd + apps
kubectl get svc -n ingress-nginx ingress-nginx-controller   # get the LB IP → set DNS
```

After DNS resolves and certificates are issued, the app is live at `https://app.example.com`.

---

## Operations Runbook

| Task                         | Command                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| View app pods                | `kubectl get pods -n tier3`                                             |
| Tail backend logs            | `kubectl logs -n tier3 deploy/backend -f`                              |
| Check Argo CD sync           | `kubectl get applications -n argocd`                                   |
| Port-forward Grafana         | `kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80` |
| Argo CD UI                   | `kubectl -n argocd port-forward svc/argocd-server 8080:443`            |
| Check certificate            | `kubectl get certificate -n tier3`                                     |
| Force a rollout              | `kubectl rollout restart deploy/backend -n tier3`                      |
| Validate manifests pre-merge | `make lint`                                                            |

### Common incidents

- **Certificate stuck `False`:** ensure DNS A record points at the LB IP and `letsencrypt-prod` issuer is reachable; check `kubectl describe challenge -n tier3`.
- **App OutOfSync in Argo CD:** inspect the diff in the UI; if Git is correct, `selfHeal` reconciles automatically, else `argocd app sync tier3-production`.
- **High latency/5xx alert:** check Grafana "Tier3 - Application Overview", inspect Loki logs, verify HPA scaled and DB is healthy (`/readyz`).

---

## License

MIT — use freely as a reference architecture. Replace all `REPLACE_ME`, `example.com`, and placeholder secrets before any real deployment.
