// ==UserScript==
// @name         Remover Ícone de Inclusão Manual - Secullum PontoWeb
// @namespace    https://violentmonkey.github.io/
// @version      1.0
// @description  Oculta e remove o ícone de lápis (inclusão manual) no cartão de ponto
// @author       Luiz Gustavo Dias Pulz
// @match        https://pontoweb.secullum.com.br/*
// @updateURL    https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/remover-icone-inclusao-manual-secullum-pontoweb.user.js
// @downloadURL  https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/remover-icone-inclusao-manual-secullum-pontoweb.user.js
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 1. Oculta via CSS de imediato para evitar piscadas na tela (FOUC)
    // Filtra pelo ícone que possui a cor da inclusão manual no estilo inline
    GM_addStyle(`
        span.fa.fa-pencil[style*="var(--cor-inclusao-manual)"] {
            display: none !important;
            visibility: hidden !important;
        }
    `);

    // 2. Função para remover os elementos do DOM
    function removerIcones() {
        // Valida se está na página do cartão de ponto
        if (!window.location.hash.includes('cartao-ponto')) return;

        const icones = document.querySelectorAll('span.fa.fa-pencil[style*="var(--cor-inclusao-manual)"]');
        icones.forEach(el => el.remove());
    }

    // 3. Observador de mudanças no DOM para tratar carregamentos dinâmicos
    const observer = new MutationObserver(() => {
        removerIcones();
    });

    // Inicia a observação assim que o documento estiver pronto
    window.addEventListener('DOMContentLoaded', () => {
        removerIcones();
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });

    // Observa alterações no hash da URL (navegação interna SPA)
    window.addEventListener('hashchange', removerIcones);
})();
