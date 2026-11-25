// ==UserScript==
// @name         Substituir Usuário Visualmente - Secullum RH
// @namespace    local.secullum
// @version      1.0
// @description  Substitui visualmente o nome e e-mail do usuário exibidos no cabeçalho do Secullum RH para capturas de tela e PFs
// @author       Luiz Gustavo Dias Pulz
// @match        https://pontoweb.secullum.com.br/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const NOME_EXIBICAO = 'Suporte Secullum';
    const EMAIL_EXIBICAO = 'suporte@secullum.com.br';

    // Evita flash do usuário real antes da substituição no DOM
    GM_addStyle(`
        #info-usuario-dados:not([data-pf-masked="true"]) .info-usuario-dados-flex {
            visibility: hidden !important;
        }
    `);

    function substituirUsuario() {
        const container = document.getElementById('info-usuario-dados');
        if (!container) return;

        const flex = container.querySelector('.info-usuario-dados-flex');
        if (!flex) return;

        const paragrafos = flex.querySelectorAll('p');
        if (paragrafos.length < 2) return;

        const pNome = paragrafos[0];
        const pEmail = paragrafos[1];

        if (pNome.textContent !== NOME_EXIBICAO) {
            pNome.textContent = NOME_EXIBICAO;
        }
        if (pEmail.textContent !== EMAIL_EXIBICAO) {
            pEmail.textContent = EMAIL_EXIBICAO;
        }

        if (container.getAttribute('data-pf-masked') !== 'true') {
            container.setAttribute('data-pf-masked', 'true');
        }
    }

    const observer = new MutationObserver(() => {
        substituirUsuario();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', substituirUsuario);
    } else {
        substituirUsuario();
    }

    window.addEventListener('hashchange', substituirUsuario);
})();
