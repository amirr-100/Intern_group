/* ================================================================
   SMART ATTENDANCE SYSTEM — app.js
   Handles: navigation, page transitions, sidebar, settings tabs,
            filter chips, QR countdown timer
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Page Navigation ──────────────────────────────────────── */
  const navItems  = document.querySelectorAll('.nav-item[data-page]');
  const textLinks = document.querySelectorAll('[data-page]');

  function navigateTo(pageId) {
    const target  = document.getElementById('page-' + pageId);
    const current = document.querySelector('.page.active');
    if (!target || current === target) return;

    // Animate current page out
    current.classList.add('exiting');
    current.addEventListener('animationend', () => {
      current.classList.remove('active', 'exiting');
    }, { once: true });

    // Animate target page in (slight delay so exit starts first)
    setTimeout(() => {
      target.classList.add('active');
      // Scroll content area to top
      document.querySelector('.pages-container').scrollTop = 0;
    }, 80);

    // Update active nav item
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });

    // Update page title in navbar (optional flavour)
    const activeNav = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (activeNav) {
      document.title = 'SMART — ' + activeNav.querySelector('span').textContent;
    }

    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 768) closeSidebar();
  }

  // Attach to sidebar nav links
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // Attach to inline "View all →" or similar text links
  document.addEventListener('click', e => {
    const link = e.target.closest('[data-page]');
    if (link && !link.classList.contains('nav-item')) {
      e.preventDefault();
      navigateTo(link.dataset.page);
    }
  });

  /* ── Mobile Sidebar ───────────────────────────────────────── */
  const menuBtn  = document.getElementById('menuBtn');
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    menuBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
  }

  menuBtn.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener('click', closeSidebar);

  /* ── Settings Tabs ────────────────────────────────────────── */
  document.querySelectorAll('.stab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      const panel = document.getElementById('tab-' + tabId);
      if (!panel) return;

      // Deactivate all
      document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));

      // Activate clicked
      tab.classList.add('active');
      panel.classList.add('active');
    });
  });

  /* ── Filter Chips ─────────────────────────────────────────── */
  document.querySelectorAll('.chips').forEach(group => {
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });

  /* ── QR Countdown Timer ───────────────────────────────────── */
  const timerEl    = document.getElementById('timerCount');
  const progressEl = document.getElementById('qrProgress');
  const INTERVAL   = 10; // seconds
  let remaining    = INTERVAL;

  function updateTimer() {
    remaining--;
    if (remaining <= 0) remaining = INTERVAL;

    if (timerEl)    timerEl.textContent = remaining;
    if (progressEl) progressEl.style.width = (remaining / INTERVAL * 100) + '%';
  }

  setInterval(updateTimer, 1000);

  /* ── Search box live filter (tables) ─────────────────────── */
  document.querySelectorAll('.search-box input').forEach(input => {
    input.addEventListener('input', function () {
      const query = this.value.toLowerCase().trim();
      // Find closest table
      const section = this.closest('.page') || document;
      const rows    = section.querySelectorAll('table tbody tr');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!query || text.includes(query)) ? '' : 'none';
      });
    });
  });

  /* ── Control Buttons — feedback flash ────────────────────── */
  document.querySelectorAll('.control-btn, .act-btn, .export-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const original = this.innerHTML;
      this.style.opacity = '0.6';
      setTimeout(() => { this.style.opacity = ''; }, 180);
    });
  });

  /* ── Danger / End Session ─────────────────────────────────── */
  document.querySelectorAll('.danger-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const confirmed = window.confirm('Are you sure you want to end this session?');
      if (confirmed) {
        btn.textContent = 'Session Ended';
        btn.disabled = true;
        btn.style.opacity = '0.5';
      }
    });
  });

  /* ── Stat card hover number pop ──────────────────────────── */
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .22s ease';
    });
  });

  /* ── Bar chart load animation ─────────────────────────────── */
  function animateBars() {
    const bars = document.querySelectorAll('.bar');
    bars.forEach((bar, i) => {
      const target = bar.style.getPropertyValue('--h');
      bar.style.setProperty('--h', '0%');
      setTimeout(() => {
        bar.style.setProperty('--h', target);
      }, i * 80 + 200);
    });
  }

  // Run on analytics page open
  const analyticsNavItem = document.querySelector('.nav-item[data-page="analytics"]');
  if (analyticsNavItem) {
    analyticsNavItem.addEventListener('click', () => {
      setTimeout(animateBars, 400);
    });
  }

  /* ── Window resize: close sidebar if desktop ─────────────── */
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeSidebar();
  });

  /* ── Init: set page title for default page ───────────────── */
  document.title = 'SMART — Dashboard';
});