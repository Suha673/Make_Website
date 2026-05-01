const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const authModal = document.querySelector("#auth-modal");
const openAuthButtons = document.querySelectorAll("[data-open-auth]");
const closeAuthButton = document.querySelector("[data-close-auth]");
const headerActions = document.querySelector(".header-actions");
const apiRoutes = {
  booking: "/api/bookings",
  feedback: "/api/feedback",
  auth: "/api/auth",
  googleAuth: "/api/google-auth",
};
const apiBaseUrl = getApiBaseUrl();
const refreshDashboardButton = document.querySelector("#refresh-dashboard");
const counters = document.querySelectorAll("[data-count-to]");

renderProfile();
initCounters();

if (navToggle && header) {
  navToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

openAuthButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (authModal && typeof authModal.showModal === "function") {
      authModal.showModal();
    }
  });
});

if (closeAuthButton && authModal) {
  closeAuthButton.addEventListener("click", () => authModal.close());
}

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = form.querySelector("[data-form-message], [data-feedback-message]");
    const endpoint = getEndpoint(form);

    if (message) {
      message.textContent = "Sending...";
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(getFormData(form)),
      });
      const result = await parseResponse(response);

      if (!response.ok) {
        throw new Error(getResponseError(response, result));
      }

      if (message) {
        message.textContent = result.message;
      }

      if (form.dataset.formType === "auth") {
        const formData = getFormData(form);
        saveUser({
          id: result.userId,
          email: formData.email,
        });
        renderProfile();
      }

      form.reset();

      if (form.dataset.formType === "auth" && authModal) {
        setTimeout(() => authModal.close(), 700);
      }
    } catch (error) {
      if (message) {
        message.textContent = error.message;
      }
    }
  });
});

document.addEventListener("click", (event) => {
  if (event.target.matches("[data-logout]")) {
    localStorage.removeItem("luminaUser");
    renderProfile();
  }

  if (event.target.closest("[data-google-login]")) {
    handleGoogleLogin();
  }
});

async function handleGoogleLogin() {
  const form = authModal?.querySelector("[data-form-type='auth']");
  const emailInput = form?.querySelector("input[name='email']");
  const message = form?.querySelector("[data-form-message]");
  const email = emailInput?.value.trim() || window.prompt("Enter your Google email address");

  if (!email) {
    if (message) {
      message.textContent = "Please enter your Google email address.";
    }
    return;
  }

  if (message) {
    message.textContent = "Connecting with Google...";
  }

  try {
    const response = await fetch(`${apiBaseUrl}${apiRoutes.googleAuth}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
    const result = await parseResponse(response);

    if (!response.ok) {
      throw new Error(getResponseError(response, result));
    }

    saveUser({
      id: result.userId,
      email: result.email || email,
      provider: "google",
    });
    renderProfile();

    if (message) {
      message.textContent = result.message;
    }

    if (authModal) {
      setTimeout(() => authModal.close(), 700);
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message;
    }
  }
}

function getEndpoint(form) {
  return `${apiBaseUrl}${apiRoutes[form.dataset.formType] || apiRoutes.booking}`;
}

function getFormData(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("luminaUser"));
  } catch (error) {
    return null;
  }
}

function saveUser(user) {
  localStorage.setItem("luminaUser", JSON.stringify(user));
}

function renderProfile() {
  if (!headerActions) {
    return;
  }

  const user = getStoredUser();
  const oldProfile = headerActions.querySelector(".profile-chip");
  const authButton = headerActions.querySelector("[data-open-auth]");

  if (oldProfile) {
    oldProfile.remove();
  }

  if (!user) {
    if (authButton) {
      authButton.hidden = false;
    }
    return;
  }

  if (authButton) {
    authButton.hidden = true;
  }

  const profile = document.createElement("div");
  profile.className = "profile-chip";
  profile.innerHTML = `
    <span class="profile-avatar">${escapeHtml(user.email.charAt(0).toUpperCase())}</span>
    <span class="profile-info">
      <strong>Profile</strong>
      <small>${escapeHtml(user.email)}</small>
    </span>
    <button type="button" data-logout>Logout</button>
  `;
  headerActions.appendChild(profile);
}

function initCounters() {
  if (!counters.length) {
    return;
  }

  const startCounters = (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      animateCounter(entry.target);
      observer.unobserve(entry.target);
    });
  };

  const observer = new IntersectionObserver(startCounters, {
    threshold: 0.45,
  });

  counters.forEach((counter) => observer.observe(counter));
}

function animateCounter(counter) {
  const target = Number(counter.dataset.countTo);
  const duration = 1600;
  const startValue = 1;
  const startTime = performance.now();

  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (target - startValue) * easedProgress);

    counter.textContent = `${currentValue}+`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  };

  requestAnimationFrame(update);
}

if (refreshDashboardButton) {
  refreshDashboardButton.addEventListener("click", loadDashboard);
  loadDashboard();
}

async function loadDashboard() {
  const bookingsList = document.querySelector("#bookings-list");
  const feedbackList = document.querySelector("#feedback-list");

  if (!bookingsList || !feedbackList) {
    return;
  }

  try {
    const [bookingsResponse, feedbackResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/bookings`),
      fetch(`${apiBaseUrl}/api/feedback`),
    ]);
    const bookingsData = await parseResponse(bookingsResponse);
    const feedbackData = await parseResponse(feedbackResponse);

    renderBookings(bookingsList, bookingsData.bookings || []);
    renderFeedback(feedbackList, feedbackData.feedback || []);
  } catch (error) {
    bookingsList.innerHTML = `<p class="empty-state">${error.message}</p>`;
    feedbackList.innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
}

function renderBookings(container, bookings) {
  if (!bookings.length) {
    container.innerHTML = '<p class="empty-state">No booking requests yet.</p>';
    return;
  }

  container.innerHTML = bookings.map((booking) => `
    <article class="record-card">
      <h3>${escapeHtml(booking.name)}</h3>
      <p><strong>Service:</strong> ${escapeHtml(booking.service)}</p>
      <p><strong>Date:</strong> ${escapeHtml(booking.date)} ${escapeHtml(booking.time || "")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(booking.phone || "Not provided")}</p>
      <p>${escapeHtml(booking.message || "")}</p>
    </article>
  `).join("");
}

function renderFeedback(container, feedback) {
  if (!feedback.length) {
    container.innerHTML = '<p class="empty-state">No feedback yet.</p>';
    return;
  }

  container.innerHTML = feedback.map((item) => `
    <article class="record-card">
      <p>${escapeHtml(item.experience)}</p>
      <small>${new Date(item.createdAt).toLocaleString()}</small>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getApiBaseUrl() {
  const isLocalHost = ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
  const isBackendOrigin = window.location.port === "3000";

  if (isLocalHost && !isBackendOrigin) {
    return "http://localhost:3000";
  }

  return "";
}

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Backend returned an invalid response. Please run the site with npm start and open http://localhost:3000.");
  }
}

function getResponseError(response, result) {
  if (result.error) {
    return result.error;
  }

  if (response.status === 401) {
    return "Invalid email or password.";
  }

  if (response.status === 409) {
    return "An account with this email already exists.";
  }

  if (response.status >= 500) {
    return "Backend server error. Restart npm start and try again.";
  }

  return "Request failed. Please check the details and try again.";
}
