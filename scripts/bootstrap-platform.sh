#!/usr/bin/env bash
# Installs platform add-ons onto a fresh GKE cluster.
# Prereqs: kubectl context pointing at the cluster, helm 3 installed.
set -euo pipefail

echo "==> Adding Helm repos"
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

echo "==> Ingress-NGINX"
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace \
  -f platform/ingress-nginx/values.yaml

echo "==> cert-manager"
helm upgrade --install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --set crds.enabled=true
kubectl wait --for=condition=Available deploy --all -n cert-manager --timeout=180s
kubectl apply -f platform/cert-manager/cluster-issuer.yaml

echo "==> kube-prometheus-stack (monitoring)"
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f platform/monitoring/kube-prometheus-stack-values.yaml
kubectl apply -f platform/monitoring/backend-servicemonitor.yaml

echo "==> Loki + Promtail (logging)"
helm upgrade --install loki grafana/loki-stack \
  -n logging --create-namespace \
  -f platform/logging/loki-stack-values.yaml

echo "==> ArgoCD (GitOps)"
helm upgrade --install argocd argo/argo-cd -n argocd --create-namespace
kubectl wait --for=condition=Available deploy --all -n argocd --timeout=300s
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application-staging.yaml
kubectl apply -f argocd/application-production.yaml

echo "==> Done. Retrieve the ingress IP:"
echo "    kubectl get svc -n ingress-nginx ingress-nginx-controller"
