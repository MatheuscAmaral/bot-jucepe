# Bot JUCEPE - Webhook Service

Serviço de webhook para automação de pedidos de viabilidade no sistema JUCEPE.

## 🚀 Como executar

### Desenvolvimento Local

1. **Instalar dependências:**

```bash
pnpm install
```

2. **Configurar variáveis de ambiente:**
   Certifique-se de que o arquivo `.env` está configurado com as credenciais necessárias.

3. **Executar o webhook:**

```bash
pnpm run webhook
# ou
npm run webhook
```

4. **Testar o webhook:**

```bash
node test-webhook.js
```

### Produção (EC2)

1. **Instalar Node.js e pnpm no servidor**
2. **Clonar o repositório**
3. **Instalar dependências:** `pnpm install`
4. **Configurar variáveis de ambiente**
5. **Executar:** `pnpm run webhook`

Para manter o serviço rodando, recomenda-se usar PM2:

```bash
npm install -g pm2
pm2 start "pnpm run webhook" --name bot-jucepe
pm2 save
pm2 startup
```

## 🔧 Melhorias Implementadas

### Problemas Resolvidos

1. **"Execution context was destroyed"**

   - Verificação de página ativa antes de cada operação
   - Função `ensurePageIsActive()` para validar contexto
   - Melhor tratamento de erros de navegação

2. **Estabilidade do Puppeteer**
   - Configurações otimizadas do Chromium
   - Bloqueio de recursos desnecessários (imagens, CSS, fontes)
   - User-agent mais realista
   - Timeouts mais robustos

### Endpoints

- **Health Check:** `GET /health`
- **Webhook Viabilidade:** `POST /webhook/viability`

### Logs

O sistema fornece logs detalhados sobre:

- Navegações detectadas
- Verificações de contexto da página
- Tentativas de retry
- Erros específicos e suas causas

## 🐛 Debugging

Se ainda ocorrerem erros de "Execution context was destroyed":

1. Verifique os logs para identificar quando a navegação inesperada ocorre
2. Aumente os delays entre operações se necessário
3. Verifique se o site JUCEPE não mudou sua estrutura

## 📊 Monitoramento

O webhook retorna informações detalhadas sobre:

- Número de tentativas realizadas
- Sucesso/falha da operação
- Protocolo gerado (se bem-sucedido)
- Mensagens de erro específicas

## 🔧 Scripts Disponíveis

- `pnpm run webhook` - Inicia o servidor webhook
- `pnpm run dev` - Alias para webhook (desenvolvimento)
- `pnpm run build` - Compila TypeScript
- `node test-webhook.js` - Testa o webhook localmente
