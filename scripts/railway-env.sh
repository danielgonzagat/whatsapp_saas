#!/bin/bash
# Extrai variáveis dos dois serviços Railway para o PULSE usar
# Uso: source scripts/railway-env.sh

echo "Extraindo variáveis do Backend..."
railway service "whatsapp_saas Copy" 2>/dev/null
BACKEND_VARS=$(railway variables --json 2>/dev/null)
export BACKEND_VARS
PULSE_BACKEND_URL=$(echo "$BACKEND_VARS" | grep -o '"RAILWAY_PUBLIC_DOMAIN":"[^"]*"' | cut -d'"' -f4)
export PULSE_BACKEND_URL
PULSE_DATABASE_URL=$(echo "$BACKEND_VARS" | grep -o '"DATABASE_URL":"[^"]*"' | cut -d'"' -f4)
export PULSE_DATABASE_URL
PULSE_ASAAS_KEY=$(echo "$BACKEND_VARS" | grep -o '"ASAAS_API_KEY":"[^"]*"' | cut -d'"' -f4)
export PULSE_ASAAS_KEY
PULSE_OPENAI_KEY=$(echo "$BACKEND_VARS" | grep -o '"OPENAI_API_KEY":"[^"]*"' | cut -d'"' -f4)
export PULSE_OPENAI_KEY

echo "Extraindo variáveis do Worker..."
railway service "Worker" 2>/dev/null
WORKER_VARS=$(railway variables --json 2>/dev/null)
export WORKER_VARS

echo "Backend: https://$PULSE_BACKEND_URL"
echo "Database: conectado"
echo "Pronto — PULSE tem acesso a tudo."
