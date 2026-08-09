/* ==========================================================================
   DG FITNESS CLUB — Landing Page Scripts

   Motion notes:
   - One IntersectionObserver drives every reveal + counter, and unobserves
     after firing, so scrolling has zero ongoing cost.
   - Scroll handlers are all { passive: true } and coalesce into a single
     rAF write per frame. Layout values are cached, never read in the loop.
   - Everything is gated on prefers-reduced-motion, which is also re-checked
     live via the mq change event.
   ========================================================================== */
(function () {
  "use strict";

  var motionMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduced = motionMQ.matches;
  motionMQ.addEventListener("change", function (e) { reduced = e.matches; });

  /* ======================================================================
     HERO ENTRANCE
     Wait two frames so the initial (hidden) styles paint before we flip
     the class — otherwise the transition is skipped entirely.
     ====================================================================== */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.documentElement.classList.add("ready");
    });
  });

  /* ======================================================================
     REVEAL + STAGGER + COUNTERS  (single observer)
     ====================================================================== */

  // Assign stagger delays from JS so the markup stays clean. These are applied
  // as a timed delay before `is-visible` is added, rather than as a CSS
  // transition-delay — that way a card's hover transition stays instant once
  // it has revealed.
  document.querySelectorAll("[data-stagger]").forEach(function (group) {
    var step = parseInt(group.getAttribute("data-stagger"), 10) || 80;
    Array.prototype.forEach.call(group.children, function (child, i) {
      // Cap total stagger — a long grid at full step reads as broken.
      child.setAttribute("data-delay", Math.min(i * step, 480));
    });
  });

  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var numberFmt = new Intl.NumberFormat("en-IN");

  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count")) || 0;

    if (reduced) { el.textContent = numberFmt.format(target); return; }

    var duration = 1600;
    var startTime = null;

    function step(now) {
      if (startTime === null) startTime = now;
      var p = Math.min((now - startTime) / duration, 1);
      el.textContent = numberFmt.format(Math.round(target * easeOutCubic(p)));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = numberFmt.format(target); // land exactly on target
    }
    requestAnimationFrame(step);
  }

  var revealTargets = document.querySelectorAll("[data-reveal], .reveal, .section-header, [data-count]");

  function show(el) {
    el.classList.add("is-visible");
    if (el.hasAttribute("data-count")) countUp(el);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        io.unobserve(el);

        var delay = parseInt(el.getAttribute("data-delay"), 10) || 0;
        if (delay && !reduced) setTimeout(function () { show(el); }, delay);
        else show(el);
      });
    }, {
      threshold: 0.15,
      // Negative bottom margin: the element must be meaningfully on screen,
      // so tall viewports don't fire everything before you reach it.
      rootMargin: "0px 0px -12% 0px"
    });

    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(show);
  }

  /* ======================================================================
     SCROLL: header state, hero parallax, scroll cue, progress, back-to-top
     All handled in one coalesced rAF pass.
     ====================================================================== */
  var header = document.querySelector("header");
  var hero = document.querySelector(".hero");
  var scrollCue = document.getElementById("scrollCue");
  var progressBar = document.getElementById("scrollProgress");
  var backToTop = document.getElementById("backToTop");

  var supportsScrollTimeline =
    window.CSS && CSS.supports && CSS.supports("animation-timeline", "scroll()");

  var ticking = false;

  var heroHeight = hero ? hero.offsetHeight : 0;
  var maxScroll = 0;

  function cacheLayout() {
    if (hero) heroHeight = hero.offsetHeight;
    maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  }
  cacheLayout();

  function onScrollFrame() {
    ticking = false;
    var y = Math.max(0, window.scrollY);

    // The header stays pinned in both directions; only its compact "stuck"
    // styling changes once the user leaves the top of the page.
    if (header) header.classList.toggle("is-stuck", y > 24);

    // Hero parallax — compositor-only transform, small speed so it reads as
    // depth rather than a bug. Skipped once the hero is off screen.
    if (hero && !reduced && y < heroHeight) {
      hero.style.setProperty("--hero-shift", (y * 0.22).toFixed(2) + "px");
    }

    if (scrollCue) scrollCue.classList.toggle("is-gone", y > 40);

    if (progressBar && !supportsScrollTimeline) {
      progressBar.style.transform = "scaleX(" + (maxScroll > 0 ? y / maxScroll : 0) + ")";
    }

    if (backToTop) backToTop.classList.toggle("is-visible", y > 500);
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }, { passive: true });

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(cacheLayout, 150);
  }, { passive: true });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(cacheLayout);
  onScrollFrame();

  /* ======================================================================
     MARQUEE — pace by content width so every strip moves at the same px/sec,
     and pause it when off screen to save battery.
     ====================================================================== */
  document.querySelectorAll(".marquee").forEach(function (marquee) {
    var track = marquee.querySelector(".marquee__track");
    if (!track) return;

    function setSpeed() {
      var half = track.scrollWidth / 2;
      if (half > 0) track.style.setProperty("--dur", (half / 55).toFixed(1) + "s");
    }
    setSpeed();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(setSpeed);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        marquee.classList.toggle("is-paused", !entries[0].isIntersecting);
      }, { threshold: 0 }).observe(marquee);
    }
  });

  /* ======================================================================
     BUTTON MICRO-INTERACTIONS
     ====================================================================== */

  // Ripple — one delegated listener for the whole page.
  document.addEventListener("pointerdown", function (e) {
    if (reduced) return;
    var btn = e.target.closest(".btn");
    if (!btn) return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText =
      "width:" + size + "px;height:" + size + "px;" +
      "left:" + (e.clientX - rect.left - size / 2) + "px;" +
      "top:" + (e.clientY - rect.top - size / 2) + "px";
    ripple.addEventListener("animationend", function () { ripple.remove(); });
    btn.appendChild(ripple);
  });

  // Magnetic hover — lerped so it feels weighted, and the rAF loop stops
  // itself once settled rather than idling forever.
  if (finePointer.matches && !reduced) {
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      var raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
      var STRENGTH = 0.3, MAX = 14;

      function loop() {
        cx += (tx - cx) * 0.15;
        cy += (ty - cy) * 0.15;
        el.style.transform = "translate3d(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px,0)";
        if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
          raf = requestAnimationFrame(loop);
        } else {
          raf = 0;
          el.style.willChange = "";
        }
      }
      function start() {
        if (!raf) { el.style.willChange = "transform"; raf = requestAnimationFrame(loop); }
      }

      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        tx = Math.max(-MAX, Math.min(MAX, (e.clientX - (r.left + r.width / 2)) * STRENGTH));
        ty = Math.max(-MAX, Math.min(MAX, (e.clientY - (r.top + r.height / 2)) * STRENGTH));
        start();
      });
      el.addEventListener("pointerleave", function () { tx = 0; ty = 0; start(); });
    });
  }

  // Cursor-following glow — delegated on each grid, not per card.
  if (finePointer.matches && !reduced) {
    document.querySelectorAll(".services-grid, .plans-grid, .why-grid").forEach(function (grid) {
      grid.addEventListener("pointermove", function (e) {
        var card = e.target.closest(".service-card, .plan-card, .why-card");
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      }, { passive: true });
    });
  }

  /* ======================================================================
     MOBILE NAVIGATION
     ====================================================================== */
  var navToggle = document.getElementById("navToggle");
  var navMobile = document.getElementById("navMobile");

  if (navToggle && navMobile) {
    navToggle.addEventListener("click", function () {
      var isOpen = navMobile.classList.toggle("is-open");
      navToggle.classList.toggle("is-open", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navMobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        navMobile.classList.remove("is-open");
        navToggle.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Active link highlight on scroll ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    var visible = new Map();
    var sectionIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible.set(e.target.id, e.intersectionRatio); });

      var bestId = null, bestRatio = 0;
      visible.forEach(function (ratio, id) {
        if (ratio > bestRatio) { bestRatio = ratio; bestId = id; }
      });

      if (bestId) {
        navLinks.forEach(function (a) {
          a.classList.toggle("active", a.getAttribute("href") === "#" + bestId);
        });
      }
    }, { threshold: [0, 0.25, 0.5, 0.75], rootMargin: "-140px 0px -50% 0px" });

    sections.forEach(function (s) { sectionIO.observe(s); });
  }

  /* ======================================================================
     MEMBERSHIP — male / female pricing
     ====================================================================== */
  var planMale = document.getElementById("planMale");
  var planFemale = document.getElementById("planFemale");
  var amounts = document.querySelectorAll(".plan-price .amt[data-male]");
  var genderLabels = document.querySelectorAll(".price-gender");
  var maleOnlyCards = document.querySelectorAll('.plan-card[data-female-hide="true"]');

  function setGender(gender) {
    var isFemale = gender === "female";

    if (planMale && planFemale) {
      planMale.classList.toggle("is-active", !isFemale);
      planFemale.classList.toggle("is-active", isFemale);
      planMale.setAttribute("aria-selected", String(!isFemale));
      planFemale.setAttribute("aria-selected", String(isFemale));
    }

    amounts.forEach(function (el) {
      el.textContent = isFemale ? el.getAttribute("data-female") : el.getAttribute("data-male");
    });

    genderLabels.forEach(function (el) {
      el.textContent = isFemale ? "Female" : "Male";
    });

    // Yearly plans are currently offered for male members only.
    maleOnlyCards.forEach(function (card) {
      card.style.display = isFemale ? "none" : "flex";
    });
  }

  if (planMale && planFemale) {
    planMale.addEventListener("click", function () { setGender("male"); });
    planFemale.addEventListener("click", function () { setGender("female"); });
  }

  /* ---------- Plan "Join Now" pre-fills the form ---------- */
  var planSelect = document.getElementById("plan");
  document.querySelectorAll("[data-plan]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (!planSelect) return;
      var wanted = btn.getAttribute("data-plan");
      Array.prototype.slice.call(planSelect.options).forEach(function (opt) {
        if (opt.text === wanted) planSelect.value = opt.value || opt.text;
      });
    });
  });

  /* ======================================================================
     GALLERY LIGHTBOX
     ====================================================================== */
  var galleryItems = Array.prototype.slice.call(document.querySelectorAll(".gallery-item img"));
  var lightbox = document.getElementById("lightbox");
  var lbImage = document.getElementById("lbImage");
  var lbClose = document.getElementById("lbClose");
  var lbPrev = document.getElementById("lbPrev");
  var lbNext = document.getElementById("lbNext");
  var lbIndex = 0;
  var lbOpener = null;

  function openLightbox(i) {
    if (!lightbox || !lbImage) return;
    lbIndex = (i + galleryItems.length) % galleryItems.length;
    lbImage.src = galleryItems[lbIndex].src;
    lbImage.alt = galleryItems[lbIndex].alt;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lbOpener) { lbOpener.focus(); lbOpener = null; }
  }

  galleryItems.forEach(function (img, i) {
    img.parentElement.addEventListener("click", function () {
      lbOpener = img.parentElement;
      openLightbox(i);
    });
  });

  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lbPrev) lbPrev.addEventListener("click", function (e) { e.stopPropagation(); openLightbox(lbIndex - 1); });
  if (lbNext) lbNext.addEventListener("click", function (e) { e.stopPropagation(); openLightbox(lbIndex + 1); });
  if (lightbox) {
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
  }
  document.addEventListener("keydown", function (e) {
    if (!lightbox || !lightbox.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") openLightbox(lbIndex - 1);
    if (e.key === "ArrowRight") openLightbox(lbIndex + 1);
  });

  /* ======================================================================
     TESTIMONIALS CAROUSEL
     The track is a scroll-snap container, so swipe and keyboard scrolling
     work with no JS at all — this only wires the arrows to page it by one
     track-width and greys them out at each end.
     ====================================================================== */
  var tTrack = document.getElementById("tTrack");
  var tPrev = document.getElementById("tPrev");
  var tNext = document.getElementById("tNext");

  if (tTrack && tPrev && tNext) {
    var page = function (dir) {
      tTrack.scrollBy({
        left: dir * tTrack.clientWidth,
        behavior: reduced ? "auto" : "smooth"
      });
    };

    // 2px of slack — scrollLeft lands on fractional pixels at some zoom levels.
    var syncArrows = function () {
      var max = tTrack.scrollWidth - tTrack.clientWidth;
      tPrev.disabled = tTrack.scrollLeft <= 2;
      tNext.disabled = tTrack.scrollLeft >= max - 2;
    };

    tPrev.addEventListener("click", function () { page(-1); });
    tNext.addEventListener("click", function () { page(1); });
    tTrack.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows);
    syncArrows();
  }

  /* ======================================================================
     LEGAL MODAL
     Privacy Policy / Terms open in a dialog instead of navigating away. The
     anchors keep their href, so middle-click, "open in new tab" and a
     JS-less visit all still reach the standalone pages.
     ====================================================================== */
  var legalModal = document.getElementById("legalModal");

  if (legalModal) {
    var legalFrame = document.getElementById("legalFrame");
    var legalTitle = document.getElementById("legalModalTitle");
    var legalReturnFocus = null;

    var openLegal = function (href, title, trigger) {
      legalReturnFocus = trigger || null;
      legalTitle.textContent = title;
      legalFrame.src = href;
      legalModal.hidden = false;
      document.body.classList.add("legal-open");
      // Next frame, so the hidden→shown paint lands before the transition.
      requestAnimationFrame(function () { legalModal.classList.add("is-open"); });
      document.getElementById("legalClose").focus();
    };

    var closeLegal = function () {
      legalModal.classList.remove("is-open");
      document.body.classList.remove("legal-open");

      var finish = function () {
        legalModal.hidden = true;
        legalFrame.src = "about:blank";   // stop the page running in the background
        if (legalReturnFocus) { legalReturnFocus.focus(); legalReturnFocus = null; }
      };
      if (reduced) finish();
      else setTimeout(finish, 250);
    };

    document.addEventListener("click", function (e) {
      var link = e.target.closest("a[data-legal]");
      if (link) {
        // Let modified clicks (new tab/window, download) behave normally.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openLegal(link.getAttribute("href"), link.getAttribute("data-legal"), link);
        return;
      }
      if (e.target.closest("[data-legal-close]")) closeLegal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !legalModal.hidden) closeLegal();
    });
  }

  /* ======================================================================
     FAQ ACCORDION
     Height animates via grid-template-rows 0fr → 1fr, so nothing needs
     measuring and it works with content of any length.
     ====================================================================== */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var q = item.querySelector(".faq-q");
    if (!q) return;

    q.setAttribute("aria-expanded", "false");

    q.addEventListener("click", function () {
      var willOpen = !item.classList.contains("is-open");

      document.querySelectorAll(".faq-item.is-open").forEach(function (other) {
        other.classList.remove("is-open");
        var otherQ = other.querySelector(".faq-q");
        if (otherQ) otherQ.setAttribute("aria-expanded", "false");
      });

      item.classList.toggle("is-open", willOpen);
      q.setAttribute("aria-expanded", String(willOpen));
    });
  });

  /* ======================================================================
     LEAD FORM → WHATSAPP
     ====================================================================== */
  var leadForm = document.getElementById("leadForm");
  var formNote = document.getElementById("formNote");
  var OWNER_WHATSAPP = "919373106312"; // country code + number, no + or spaces

  if (leadForm) {
    leadForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var required = ["fullName", "phone", "gender", "goal", "preferredTime"];
      var missing = required.filter(function (id) {
        var f = document.getElementById(id);
        return !f || !f.value.trim();
      });

      if (missing.length) {
        if (formNote) {
          formNote.style.color = "#e02b26";
          formNote.textContent = "Please fill in all required fields marked with *";
        }
        var first = document.getElementById(missing[0]);
        if (first) first.focus();
        return;
      }

      var v = function (id) {
        var f = document.getElementById(id);
        return f ? f.value.trim() : "";
      };

      var lines = [
        "*New Enquiry — DG Fitness Club*",
        "",
        "Name: " + v("fullName"),
        "WhatsApp: " + v("phone"),
        "Gender: " + v("gender"),
        "Fitness Goal: " + v("goal"),
        "Preferred Time: " + v("preferredTime"),
        "Interested Plan: " + (v("plan") || "Not decided yet")
      ];

      if (v("message")) lines.push("Message: " + v("message"));

      var url = "https://wa.me/" + OWNER_WHATSAPP + "?text=" + encodeURIComponent(lines.join("\n"));
      window.open(url, "_blank", "noopener");

      if (formNote) {
        formNote.style.color = "#157a3a";
        formNote.textContent = "Thank you! Your details are ready to send on WhatsApp.";
      }
      leadForm.reset();
    });
  }

  /* ---------- Back to top ---------- */
  if (backToTop) {
    backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    });
  }
})();
