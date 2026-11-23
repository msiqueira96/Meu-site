# Workspace Rules — Auto Git Push on Changes

Sempre que qualquer arquivo do projeto (`index.html`, `css/*`, `js/*`, `assets/*`) for criado ou editado durante uma resposta no chat:

1. Ao finalizar e verificar as edições do turno, execute automaticamente o script `powershell -ExecutionPolicy Bypass -File .\scripts\auto-push.ps1 "Descrição curta da alteração"` (com `BypassSandbox: true` para permitir acesso à rede no `git push`).
2. Se o repositório Git ou o remote `origin` ainda não estiverem configurados, avise o usuário para informar a URL do repositório GitHub.
