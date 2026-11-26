# monkey-scripts

Coleção de userscripts para **Violentmonkey** e otimizações de navegador para uso geral e no trabalho.

## Scripts disponíveis

Todos os scripts possuem `@updateURL` e `@downloadURL` configurados para auto-instalação e atualização automática via **Violentmonkey**.

| Script | Versão | Descrição | Instalar |
| :--- | :---: | :--- | :---: |
| **AdBlock Secullum Ponto Web** | `3.5` | Fecha automaticamente popups, banners e termos recorrentes no Ponto Web. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/adblock-secullum-ponto-web.user.js) |
| **Auto Selecionar Tabela de Manutenção de Funcionários** | `1.8` | Seleciona automaticamente X checkboxes em tabela virtual a partir de um clique. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-selecionar-tabela-manutencao-funcionarios.user.js) |
| **Secullum - Gerador de documentos e cadastros de teste** | `1.2.0` | Gera CPF, PIS e CNPJ válidos e preenche cadastros de teste (`Alt+Shift+G`). | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/gerador-documentos-cadastros-teste.user.js) |
| **PF Maker - Secullum RH** | `1.2` | Mascara usuário no cabeçalho e oculta carrossel e botão flutuante para capturas. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/pf-maker-secullum-rh.user.js) |
| **Remover Ícone de Inclusão Manual - Secullum PontoWeb** | `1.0` | Oculta e remove o ícone de lápis (inclusão manual) no cartão de ponto. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/remover-icone-inclusao-manual-secullum-pontoweb.user.js) |
| **Auto Preencher Imagem - Secullum Admin** | `1.0.0` | Define Base Path persistente e preenche Título e Caminho ao selecionar imagem. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/auto-preencher-imagem-secullum-admin.user.js) |
| **Photopea - Remover Barra Lateral** | `1.6` | Remove a barra lateral direita e centraliza o editor no Photopea. | [Instalar (Raw)](https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/photopea-remover-barra-lateral.user.js) |

## Como instalar e atualizar

1. Instale a extensão **Violentmonkey** no navegador (Firefox, Chrome ou Edge).
2. Clique em **Instalar (Raw)** na tabela acima para o script desejado.
3. O Violentmonkey detectará o cabeçalho `==UserScript==` e abrirá a tela de confirmação.
4. As atualizações futuras serão baixadas automaticamente sempre que a `@version` do script for incrementada na branch `main`.

## Padrão dos scripts

- Arquivos sempre com sufixo `.user.js` e nomes em `kebab-case`.
- Bloco `==UserScript==` atualizado com `@name`, `@namespace`, `@version`, `@description`, `@match`, `@updateURL` e `@downloadURL`.
- **Zero dados sensíveis:** nunca versionar senhas, tokens, CPFs ou dados de clientes.
