/* Player de vídeo leve (~8 KB, sem bibliotecas).
   Melhoria progressiva: o <video> vem com `controls` nativos no HTML; se este
   script não carregar, o vídeo continua funcionando normalmente.

   Recursos: botão central, linha do tempo com buffer e prévia do tempo,
   arrastar com o dedo, ±10 s, toque duplo nas laterais, volume, velocidade,
   picture-in-picture, tela cheia, atalhos de teclado, auto-ocultar controles,
   pausa ao sair da tela e só um vídeo tocando por vez. */
(function () {
    'use strict';

    var ICONS = {
        play: '<path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z"/>',
        pause: '<path d="M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>',
        replay: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/>',
        back: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/><text x="12" y="15.5" font-size="6.5" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">10</text>',
        fwd: '<path d="M12 5V2l5 4-5 4V7a5 5 0 1 0 5 5h2a7 7 0 1 1-7-7Z"/><text x="12" y="15.5" font-size="6.5" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">10</text>',
        vol: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4ZM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54Z"/>',
        volLow: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4Z"/>',
        mute: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12.59 3L19 9.59 20.41 11 18 13.41 20.41 15.8 19 17.22l-2.41-2.41-2.41 2.41-1.41-1.42 2.41-2.39-2.41-2.41L14.18 9.6l2.41 2.4Z"/>',
        pip: '<path d="M19 7h-8v6h8V7Zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H3V5h18v14Z"/>',
        full: '<path d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z"/>',
        exitFull: '<path d="M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z"/>'
    };
    var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
    var players = [];

    function svg(name) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
    }

    function fmt(t) {
        if (!isFinite(t) || t < 0) t = 0;
        t = Math.floor(t);
        var h = Math.floor(t / 3600);
        var m = Math.floor((t % 3600) / 60);
        var s = t % 60;
        var mm = h ? (m < 10 ? '0' + m : m) : m;
        return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
    }

    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html) n.innerHTML = html;
        return n;
    }

    function button(cls, icon, label) {
        var b = el('button', 'vp-btn ' + cls, svg(icon));
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.title = label;
        return b;
    }

    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function Player(root) {
        var video = root.querySelector('video');
        if (!video) return;

        var canHover = window.matchMedia('(hover: hover)').matches;
        var idleTimer = 0;
        var toastTimer = 0;
        var rafId = 0;
        var scrubbing = false;
        var wasPlayingBeforeScrub = false;
        var lastTap = 0;
        var tapTimer = 0;
        var lastShownSecond = -1;

        // ----------------------------------------------------------- DOM
        video.removeAttribute('controls');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        root.tabIndex = 0;
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', root.getAttribute('data-title') || 'Player de vídeo');

        var shade = el('div', 'vp-shade');
        var big = el('button', 'vp-big', svg('play'));
        big.type = 'button';
        big.setAttribute('aria-label', 'Reproduzir vídeo');
        var spinner = el('div', 'vp-spinner');
        var hintL = el('div', 'vp-seek-hint left', svg('back') + '<span>10 segundos</span>');
        var hintR = el('div', 'vp-seek-hint right', svg('fwd') + '<span>10 segundos</span>');
        var toast = el('div', 'vp-toast');
        toast.setAttribute('aria-live', 'polite');

        var bar = el('div', 'vp-bar');

        var progress = el('div', 'vp-progress');
        progress.tabIndex = 0;
        progress.setAttribute('role', 'slider');
        progress.setAttribute('aria-label', 'Linha do tempo');
        progress.setAttribute('aria-valuemin', '0');
        var track = el('div', 'vp-track');
        var buffer = el('div', 'vp-buffer');
        var played = el('div', 'vp-played');
        var thumb = el('div', 'vp-thumb');
        var tip = el('div', 'vp-tip', '0:00');
        track.appendChild(buffer);
        track.appendChild(played);
        progress.appendChild(track);
        progress.appendChild(thumb);
        progress.appendChild(tip);

        var row = el('div', 'vp-row');
        var playBtn = button('vp-play', 'play', 'Reproduzir (k)');
        var backBtn = button('vp-skip', 'back', 'Voltar 10 segundos (j)');
        var fwdBtn = button('vp-skip', 'fwd', 'Avançar 10 segundos (l)');

        var volWrap = el('div', 'vp-volume');
        var muteBtn = button('vp-mute', 'vol', 'Silenciar (m)');
        var volRange = el('input');
        volRange.type = 'range';
        volRange.min = '0';
        volRange.max = '1';
        volRange.step = '0.05';
        volRange.value = String(video.volume);
        volRange.setAttribute('aria-label', 'Volume');
        volWrap.appendChild(muteBtn);
        volWrap.appendChild(volRange);

        var time = el('div', 'vp-time', '0:00 / 0:00');
        var spacer = el('div', 'vp-spacer');

        var speedWrap = el('div', 'vp-speed');
        var speedBtn = el('button', 'vp-btn vp-speed-btn', '1x');
        speedBtn.type = 'button';
        speedBtn.setAttribute('aria-label', 'Velocidade de reprodução');
        speedBtn.setAttribute('aria-haspopup', 'true');
        speedBtn.setAttribute('aria-expanded', 'false');
        speedBtn.title = 'Velocidade';
        var menu = el('div', 'vp-menu');
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.appendChild(el('div', 'vp-menu-title', 'Velocidade'));
        SPEEDS.forEach(function (s) {
            var item = el('button', '', s === 1 ? 'Normal' : s + 'x');
            item.type = 'button';
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', s === 1 ? 'true' : 'false');
            item.setAttribute('data-speed', String(s));
            menu.appendChild(item);
        });
        speedWrap.appendChild(speedBtn);
        speedWrap.appendChild(menu);

        var pipBtn = button('vp-pip', 'pip', 'Picture-in-picture');
        pipBtn.hidden = !(document.pictureInPictureEnabled && !video.disablePictureInPicture);
        var fullBtn = button('vp-full', 'full', 'Tela cheia (f)');

        [playBtn, backBtn, fwdBtn, volWrap, time, spacer, speedWrap, pipBtn, fullBtn].forEach(function (n) {
            row.appendChild(n);
        });
        bar.appendChild(progress);
        bar.appendChild(row);

        [shade, hintL, hintR, spinner, big, toast, bar].forEach(function (n) { root.appendChild(n); });

        // ----------------------------------------------------- helpers
        function duration() {
            return isFinite(video.duration) ? video.duration : 0;
        }

        function togglePlay() {
            if (video.paused || video.ended) {
                var p = video.play();
                if (p && p.catch) p.catch(function () {});
            } else {
                video.pause();
            }
        }

        function seekBy(sec) {
            if (!duration()) return;
            video.currentTime = Math.max(0, Math.min(duration(), video.currentTime + sec));
            render();
        }

        function showToast(text) {
            toast.textContent = text;
            toast.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 900);
        }

        function flashHint(hint) {
            hint.classList.add('show');
            setTimeout(function () { hint.classList.remove('show'); }, 450);
        }

        function wake() {
            root.classList.remove('is-idle');
            clearTimeout(idleTimer);
            if (!video.paused && !scrubbing && menu.hidden) {
                idleTimer = setTimeout(function () { root.classList.add('is-idle'); }, canHover ? 2200 : 3000);
            }
        }

        function render() {
            var d = duration();
            var ratio = d ? video.currentTime / d : 0;
            played.style.transform = 'scaleX(' + ratio + ')';
            thumb.style.left = ratio * 100 + '%';
            // Texto e ARIA só mudam quando o segundo muda (evita trabalho a cada frame)
            var sec = Math.floor(video.currentTime);
            if (sec === lastShownSecond && video.paused === false) return;
            lastShownSecond = sec;
            time.textContent = fmt(video.currentTime) + ' / ' + fmt(d);
            progress.setAttribute('aria-valuenow', String(sec));
            progress.setAttribute('aria-valuetext', fmt(video.currentTime) + ' de ' + fmt(d));
        }

        function renderBuffer() {
            var d = duration();
            if (!d || !video.buffered.length) return;
            var end = 0;
            for (var i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= video.currentTime + 0.5) end = video.buffered.end(i);
            }
            buffer.style.transform = 'scaleX(' + Math.min(1, end / d) + ')';
        }

        // Atualiza a barra com rAF (fluido) só enquanto toca e está visível.
        function loop() {
            if (!root.classList.contains('is-idle')) render();
            rafId = requestAnimationFrame(loop);
        }

        function renderVolume() {
            var v = video.muted ? 0 : video.volume;
            volRange.value = String(v);
            volRange.style.setProperty('--v', v * 100 + '%');
            muteBtn.innerHTML = svg(v === 0 ? 'mute' : v < 0.5 ? 'volLow' : 'vol');
            muteBtn.setAttribute('aria-label', v === 0 ? 'Ativar som (m)' : 'Silenciar (m)');
        }

        function setSpeed(s) {
            video.playbackRate = s;
            speedBtn.textContent = s + 'x';
            Array.prototype.forEach.call(menu.querySelectorAll('[data-speed]'), function (b) {
                b.setAttribute('aria-checked', String(parseFloat(b.getAttribute('data-speed')) === s));
            });
        }

        function setMenu(open) {
            menu.hidden = !open;
            speedBtn.setAttribute('aria-expanded', String(open));
            if (open) {
                clearTimeout(idleTimer);
                root.classList.remove('is-idle');
            } else {
                wake();
            }
        }

        function toggleFullscreen() {
            if (fullscreenElement()) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
                return;
            }
            var req = root.requestFullscreen || root.webkitRequestFullscreen;
            if (req) {
                var r = req.call(root);
                // Vídeo deitado: tenta girar a tela no celular
                var lock = function () {
                    if (screen.orientation && screen.orientation.lock && video.videoWidth > video.videoHeight) {
                        screen.orientation.lock('landscape').catch(function () {});
                    }
                };
                if (r && r.then) r.then(lock).catch(function () {}); else lock();
            } else if (video.webkitEnterFullscreen) {
                // iPhone: só o <video> pode ir para tela cheia (controles nativos)
                video.webkitEnterFullscreen();
            }
        }

        function onFullscreenChange() {
            var fs = fullscreenElement() === root;
            root.classList.toggle('is-fullscreen', fs);
            fullBtn.innerHTML = svg(fs ? 'exitFull' : 'full');
            fullBtn.setAttribute('aria-label', fs ? 'Sair da tela cheia (f)' : 'Tela cheia (f)');
            if (!fs && screen.orientation && screen.orientation.unlock) {
                try { screen.orientation.unlock(); } catch (e) {}
            }
        }

        // --------------------------------------------------- scrubbing
        function ratioFromEvent(e) {
            var rect = track.getBoundingClientRect();
            var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            return Math.max(0, Math.min(1, x / rect.width));
        }

        function previewAt(ratio) {
            tip.textContent = fmt(ratio * duration());
            var w = progress.clientWidth;
            var half = tip.offsetWidth / 2;
            tip.style.left = Math.max(half, Math.min(w - half, ratio * w)) + 'px';
        }

        function scrubTo(ratio) {
            if (!duration()) return;
            video.currentTime = ratio * duration();
            played.style.transform = 'scaleX(' + ratio + ')';
            thumb.style.left = ratio * 100 + '%';
            time.textContent = fmt(ratio * duration()) + ' / ' + fmt(duration());
            previewAt(ratio);
        }

        function startScrub(e) {
            if (e.button !== undefined && e.button !== 0) return;
            scrubbing = true;
            wasPlayingBeforeScrub = !video.paused;
            if (wasPlayingBeforeScrub) video.pause();
            root.classList.add('is-scrubbing');
            if (progress.setPointerCapture && e.pointerId !== undefined) progress.setPointerCapture(e.pointerId);
            scrubTo(ratioFromEvent(e));
            wake();
        }

        function moveScrub(e) {
            if (scrubbing) {
                scrubTo(ratioFromEvent(e));
            } else if (canHover && duration()) {
                previewAt(ratioFromEvent(e));
            }
        }

        function endScrub() {
            if (!scrubbing) return;
            scrubbing = false;
            root.classList.remove('is-scrubbing');
            if (wasPlayingBeforeScrub) togglePlay();
            wake();
        }

        if (window.PointerEvent) {
            progress.addEventListener('pointerdown', startScrub);
            progress.addEventListener('pointermove', moveScrub);
            progress.addEventListener('pointerup', endScrub);
            progress.addEventListener('pointercancel', endScrub);
        } else {
            // Navegadores antigos (Safari < 13)
            progress.addEventListener('touchstart', startScrub, { passive: true });
            progress.addEventListener('touchmove', moveScrub, { passive: true });
            progress.addEventListener('touchend', endScrub);
            progress.addEventListener('mousedown', function (e) {
                startScrub(e);
                var up = function () { endScrub(); document.removeEventListener('mousemove', moveScrub); document.removeEventListener('mouseup', up); };
                document.addEventListener('mousemove', moveScrub);
                document.addEventListener('mouseup', up);
            });
            progress.addEventListener('mousemove', moveScrub);
        }

        progress.addEventListener('keydown', function (e) {
            var k = e.key;
            if (k === 'ArrowLeft' || k === 'ArrowDown') { seekBy(-5); e.preventDefault(); e.stopPropagation(); }
            else if (k === 'ArrowRight' || k === 'ArrowUp') { seekBy(5); e.preventDefault(); e.stopPropagation(); }
            else if (k === 'Home') { video.currentTime = 0; e.preventDefault(); }
            else if (k === 'End') { video.currentTime = duration(); e.preventDefault(); }
        });

        // ------------------------------------------------------ eventos
        big.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });
        playBtn.addEventListener('click', togglePlay);
        backBtn.addEventListener('click', function () { seekBy(-10); flashHint(hintL); });
        fwdBtn.addEventListener('click', function () { seekBy(10); flashHint(hintR); });

        muteBtn.addEventListener('click', function () {
            if (video.muted || video.volume === 0) {
                video.muted = false;
                if (video.volume === 0) video.volume = 0.6;
            } else {
                video.muted = true;
            }
        });
        volRange.addEventListener('input', function () {
            video.volume = parseFloat(volRange.value);
            video.muted = video.volume === 0;
        });

        speedBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setMenu(menu.hidden);
        });
        menu.addEventListener('click', function (e) {
            e.stopPropagation();
            var item = e.target.closest('[data-speed]');
            if (!item) return;
            setSpeed(parseFloat(item.getAttribute('data-speed')));
            setMenu(false);
            showToast('Velocidade ' + video.playbackRate + 'x');
        });
        document.addEventListener('click', function (e) {
            if (!menu.hidden && !speedWrap.contains(e.target)) setMenu(false);
        });

        pipBtn.addEventListener('click', function () {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(function () {});
            } else {
                video.requestPictureInPicture().catch(function () {});
            }
        });

        fullBtn.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);

        // Toque/clique na área do vídeo
        video.addEventListener('click', function (e) {
            if (!canHover) {
                // Toque duplo nas laterais = ±10s; toque simples mostra/esconde controles
                var now = Date.now();
                var rect = root.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var side = x < rect.width * 0.35 ? -1 : x > rect.width * 0.65 ? 1 : 0;
                if (now - lastTap < 300 && side) {
                    clearTimeout(tapTimer);
                    seekBy(side * 10);
                    flashHint(side < 0 ? hintL : hintR);
                    lastTap = 0;
                    return;
                }
                lastTap = now;
                clearTimeout(tapTimer);
                tapTimer = setTimeout(function () {
                    if (video.paused) togglePlay();
                    else if (root.classList.contains('is-idle')) wake();
                    else { clearTimeout(idleTimer); root.classList.add('is-idle'); }
                }, side ? 260 : 0);
                return;
            }
            togglePlay();
        });
        video.addEventListener('dblclick', function () {
            if (canHover) toggleFullscreen();
        });

        root.addEventListener('mousemove', wake);
        root.addEventListener('mouseleave', function () {
            if (!video.paused && menu.hidden) root.classList.add('is-idle');
        });
        root.addEventListener('focusin', wake);

        root.addEventListener('keydown', function (e) {
            if (e.target === volRange || e.altKey || e.ctrlKey || e.metaKey) return;
            var k = e.key.toLowerCase();
            var handled = true;
            if (k === ' ' || k === 'k') {
                if (e.target.tagName === 'BUTTON' && k === ' ') return;
                togglePlay();
            }
            else if (k === 'j' || k === 'arrowleft') { seekBy(k === 'j' ? -10 : -5); flashHint(hintL); }
            else if (k === 'l' || k === 'arrowright') { seekBy(k === 'l' ? 10 : 5); flashHint(hintR); }
            else if (k === 'arrowup') { video.muted = false; video.volume = Math.min(1, video.volume + 0.1); showToast('Volume ' + Math.round(video.volume * 100) + '%'); }
            else if (k === 'arrowdown') { video.volume = Math.max(0, video.volume - 0.1); showToast('Volume ' + Math.round(video.volume * 100) + '%'); }
            else if (k === 'm') { video.muted = !video.muted; showToast(video.muted ? 'Sem som' : 'Som ativado'); }
            else if (k === 'f') toggleFullscreen();
            else if (k === 'escape' && !menu.hidden) setMenu(false);
            else if (k >= '0' && k <= '9' && duration()) video.currentTime = duration() * parseInt(k, 10) / 10;
            else handled = false;
            if (handled) { e.preventDefault(); wake(); }
        });

        video.addEventListener('play', function () {
            // Só um vídeo tocando por vez
            players.forEach(function (p) { if (p !== video && !p.paused) p.pause(); });
        });
        video.addEventListener('playing', function () {
            root.classList.add('is-playing');
            root.classList.remove('is-waiting');
            playBtn.innerHTML = svg('pause');
            playBtn.setAttribute('aria-label', 'Pausar (k)');
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(loop);
            wake();
        });
        video.addEventListener('pause', function () {
            root.classList.remove('is-playing', 'is-waiting', 'is-idle');
            playBtn.innerHTML = svg('play');
            playBtn.setAttribute('aria-label', 'Reproduzir (k)');
            big.innerHTML = svg('play');
            big.setAttribute('aria-label', 'Reproduzir vídeo');
            cancelAnimationFrame(rafId);
            clearTimeout(idleTimer);
            render();
        });
        video.addEventListener('ended', function () {
            big.innerHTML = svg('replay');
            big.setAttribute('aria-label', 'Assistir novamente');
            playBtn.innerHTML = svg('replay');
        });
        video.addEventListener('waiting', function () { root.classList.add('is-waiting'); });
        video.addEventListener('seeking', function () { if (!video.paused) root.classList.add('is-waiting'); });
        video.addEventListener('seeked', function () { root.classList.remove('is-waiting'); });
        video.addEventListener('canplay', function () { root.classList.remove('is-waiting'); });
        video.addEventListener('loadedmetadata', function () {
            progress.setAttribute('aria-valuemax', String(Math.round(duration())));
            render();
        });
        video.addEventListener('durationchange', render);
        video.addEventListener('progress', renderBuffer);
        video.addEventListener('timeupdate', function () {
            renderBuffer();
            if (video.paused) render();
        });
        video.addEventListener('volumechange', renderVolume);
        video.addEventListener('ratechange', function () { setSpeed(video.playbackRate); });
        video.addEventListener('enterpictureinpicture', function () { root.classList.add('is-pip'); });
        video.addEventListener('leavepictureinpicture', function () { root.classList.remove('is-pip'); });

        // Pausa quando o vídeo sai da tela (economiza bateria e dados);
        // não pausa em picture-in-picture.
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function () {
                // Confere a posição real na hora (entradas podem chegar atrasadas)
                var r = root.getBoundingClientRect();
                var visible = r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
                if (!visible && !video.paused && !document.pictureInPictureElement && !fullscreenElement()) {
                    video.pause();
                }
            }, { threshold: 0.2 }).observe(root);
        }

        players.push(video);
        renderVolume();
        render();
    }

    function init() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-video-player]'), function (root) {
            if (root.getAttribute('data-ready')) return;
            root.setAttribute('data-ready', '1');
            Player(root);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
