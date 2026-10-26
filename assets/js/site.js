/* Comportamento compartilhado por todas as páginas.
   Sem dependências: substitui o GSAP + ScrollTrigger (~110 KB) que só
   eram usados para fazer fade-in ao rolar. */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----------------------------------------------------------- Navbar
    var navbar = document.getElementById('navbar');
    if (navbar) {
        // Um "sentinela" no topo da página evita escutar o evento scroll.
        var sentinel = document.createElement('div');
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:50px;pointer-events:none';
        document.body.insertBefore(sentinel, document.body.firstChild);

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                navbar.classList.toggle('shrink', !entries[0].isIntersecting);
            }).observe(sentinel);
        } else {
            var ticking = false;
            window.addEventListener('scroll', function () {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function () {
                    navbar.classList.toggle('shrink', window.scrollY > 50);
                    ticking = false;
                });
            }, { passive: true });
        }
    }

    // ------------------------------------------------------ Menu mobile
    var toggle = document.getElementById('menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (toggle && menu) {
        var setMenu = function (open) {
            menu.classList.toggle('hidden', !open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
        };
        toggle.addEventListener('click', function () {
            setMenu(menu.classList.contains('hidden'));
        });
        menu.addEventListener('click', function (e) {
            if (e.target.closest('a')) setMenu(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setMenu(false);
        });
    }

    // ------------------------------------------------ Reveal ao rolar
    var revealEls = document.querySelectorAll('.animate-on-scroll');

    // Escalonamento automático: irmãos dentro do mesmo grid entram em sequência.
    Array.prototype.forEach.call(revealEls, function (el) {
        if (el.style.transitionDelay || el.style.getPropertyValue('--d')) return;
        var parent = el.parentElement;
        if (!parent || !/\bgrid\b/.test(parent.className)) return;
        var siblings = Array.prototype.filter.call(parent.children, function (c) {
            return c.classList.contains('animate-on-scroll');
        });
        var i = siblings.indexOf(el);
        el.style.setProperty('--d', Math.min(i, 5) * 0.08 + 's');
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
        Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('visible'); });
    } else {
        var revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target); // anima só uma vez
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        Array.prototype.forEach.call(revealEls, function (el) { revealObserver.observe(el); });
    }

    // -------------------------------------------------- Barras de skill
    var bars = document.querySelectorAll('.skill-progress');
    if (bars.length) {
        var fill = function (bar) {
            bar.style.transform = 'scaleX(' + (parseFloat(bar.getAttribute('data-width')) || 0) / 100 + ')';
        };
        if (!('IntersectionObserver' in window)) {
            Array.prototype.forEach.call(bars, fill);
        } else {
            var barObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    fill(entry.target);
                    barObserver.unobserve(entry.target);
                });
            }, { threshold: 0.5 });
            Array.prototype.forEach.call(bars, function (bar) { barObserver.observe(bar); });
        }
    }

    // --------------------------------------------------- Texto digitado
    var typed = document.getElementById('typed-text');
    if (typed) {
        var text = typed.getAttribute('data-text') || '';
        if (reduceMotion) {
            typed.textContent = text;
        } else {
            var i = 0;
            var type = function () {
                if (i >= text.length) return;
                typed.textContent += text.charAt(i++);
                setTimeout(type, 70);
            };
            setTimeout(type, 900);
        }
    }
})();
