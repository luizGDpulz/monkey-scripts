// ==UserScript==
// @name         Photopea - Remover Barra Lateral
// @namespace    https://www.photopea.com/
// @version      1.6
// @description  Remove a barra lateral direita e centraliza o editor sem acionar o anti-tamper do Photopea
// @author       Luiz Gustavo Dias Pulz
// @match        https://www.photopea.com/*
// @updateURL    https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/photopea-remover-barra-lateral.user.js
// @downloadURL  https://raw.githubusercontent.com/luizGDpulz/monkey-scripts/main/photopea-remover-barra-lateral.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const css = `
        body {
            background: var(--bg-panel, #252525) !important;
        }

        /* Centraliza o editor inteiro na tela */
        .flexrow.app {
            justify-content: center !important;
            width: 100vw !important;
        }

        /* Esconde a barra lateral direita (anúncios) */
        .flexrow.app > div:nth-child(2) {
            display: none !important;
        }
    `;

    function injectCSS() {
        if (document.getElementById('pp-no-sidebar-css')) return;
        const style = document.createElement('style');
        style.id = 'pp-no-sidebar-css';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    injectCSS();
    document.addEventListener('DOMContentLoaded', injectCSS);
})();
