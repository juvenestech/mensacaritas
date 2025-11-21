(() => {
  renderFeedbackBanner();

  const calendarRoot = document.getElementById("calendar-root");
  if (!calendarRoot) {
    return;
  }

  initializeCalendar();

  const GOOGLE_CLIENT_ID =
    "203366866884-nhoh8lhg2j73v1oi5rpp00ru91lulfd1.apps.googleusercontent.com";
  const GOOGLE_SCOPES = "openid email profile";
  const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
  const GOOGLE_REDIRECT_URI =
    "https://n8n.delugan.net/webhook/juvenes/mensacaritas/callback";

  const weekdayFormatter = new Intl.DateTimeFormat("it-IT", {
    weekday: "long"
  });
  const monthFormatter = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric"
  });
  const dateFormatter = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long"
  });

  calendarRoot.addEventListener("click", (event) => {
    const target = event.target.closest(".add-btn");
    if (!target) {
      return;
    }

    const isoDate = target.dataset.date;
    handleAddVolunteer(isoDate);
  });

  async function initializeCalendar() {
    renderPlaceholderMessage("Caricamento disponibilità in corso...");

    try {
      const availabilityData = await fetchAvailabilityData();
      const monthsMap = buildMonthsMap(availabilityData);
      renderCalendar(monthsMap);
    } catch (error) {
      console.error("Errore durante il caricamento delle disponibilità:", error);
      renderPlaceholderMessage(
        "Non è stato possibile caricare le disponibilità. Riprova più tardi."
      );
    }
  }

  function buildMonthsMap(availabilityData) {
    const monthsMap = new Map();

    for (const entry of availabilityData) {
      if (!entry?.data) {
        continue;
      }

      const date = new Date(`${entry.data}T00:00:00`);
      if (Number.isNaN(date.valueOf())) {
        continue;
      }

      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      const monthLabel = capitalize(monthFormatter.format(date));

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          label: monthLabel,
          days: []
        });
      }

      const maxSlots = Number(entry.n_volontari) || 0;
      const volunteers = [];

      for (let slot = 1; slot <= maxSlots; slot += 1) {
        const parsedVolunteer = parseVolunteerEntry(entry[`volontario_${slot}`]);
        volunteers.push(parsedVolunteer);
      }

      const firstEmptySlotIndex = volunteers.findIndex((name) => !name);

      monthsMap.get(monthKey).days.push({
        isoDate: entry.data,
        weekday: capitalize(weekdayFormatter.format(date)),
        dateDisplay: dateFormatter.format(date),
        volunteers,
        maxSlots,
        firstEmptySlotIndex
      });
    }

    return monthsMap;
  }

  function renderCalendar(monthsMap) {
    calendarRoot.innerHTML = "";

    const orderedMonths = Array.from(monthsMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    if (!orderedMonths.length) {
      renderPlaceholderMessage(
        "Al momento non ci sono date disponibili per la prenotazione."
      );
      return;
    }

    orderedMonths.forEach(([, monthData]) => {
      monthData.days.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
      const maxSlots = Math.max(
        ...monthData.days.map((day) => day.maxSlots),
        0
      );

      const section = document.createElement("section");
      section.className = "month-section";

      const title = document.createElement("div");
      title.className = "month-name";
      title.textContent = monthData.label;
      section.appendChild(title);

      const wrapper = document.createElement("div");
      wrapper.className = "table-wrapper";

      const table = document.createElement("table");
      table.setAttribute("role", "grid");

      const thead = document.createElement("thead");
      const weekdayRow = document.createElement("tr");

      monthData.days.forEach((day) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = day.weekday;
        weekdayRow.appendChild(th);
      });

      const dateRow = document.createElement("tr");
      dateRow.className = "date-row";

      monthData.days.forEach((day) => {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = day.dateDisplay;
        dateRow.appendChild(th);
      });

      thead.appendChild(weekdayRow);
      thead.appendChild(dateRow);

      const tbody = document.createElement("tbody");

      for (let slot = 0; slot < maxSlots; slot += 1) {
        const tr = document.createElement("tr");

        monthData.days.forEach((day) => {
          const td = document.createElement("td");
          td.dataset.date = day.isoDate;
          const volunteerEntry = day.volunteers[slot];
          const firstEmptySlotIndex =
            typeof day.firstEmptySlotIndex === "number"
              ? day.firstEmptySlotIndex
              : day.volunteers.findIndex((name) => !name);

          if (volunteerEntry) {
            td.classList.add("filled");
            if (volunteerEntry.href) {
              const link = document.createElement("a");
              link.href = volunteerEntry.href;
              link.textContent = volunteerEntry.label;
              if (!volunteerEntry.href.startsWith("mailto:")) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
              }
              td.appendChild(link);
            } else {
              td.textContent = volunteerEntry.label;
            }
          } else {
            td.classList.add("empty");

            if (slot === firstEmptySlotIndex && firstEmptySlotIndex !== -1) {
              td.appendChild(createAddButton(day.isoDate));
            }
          }

          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      }

      table.appendChild(thead);
      table.appendChild(tbody);
      wrapper.appendChild(table);
      section.appendChild(wrapper);
      calendarRoot.appendChild(section);
    });
  }

  function handleAddVolunteer(isoDate) {
    redirectToGoogleOAuth(isoDate);
  }

  function capitalize(value) {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function redirectToGoogleOAuth(isoDate) {
    const statePayload = btoa(
      JSON.stringify({
        date: isoDate
      })
    );

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "online",
      include_granted_scopes: "true",
      prompt: "consent",
      state: statePayload
    });

    const popup = window.open(
      `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
      "oauth-window",
      "width=500,height=600"
    );

    if (!popup) {
      alert(
        "Impossibile aprire la finestra per il login con Google. Controlla che il blocco popup sia disabilitato."
      );
      return;
    }

    const pollingInterval = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollingInterval);
        initializeCalendar();
      }
    }, 800);
  }

  function createAddButton(isoDate) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-btn";
    button.dataset.date = isoDate;
    button.innerHTML =
      '<span aria-hidden="true">+</span><span class="sr-only">Prenotati per questa data</span>';
    return button;
  }

  function renderFeedbackBanner() {
    const feedbackEl = document.getElementById("feedback-banner");
    if (!feedbackEl) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const errorMessage = params.get("error");
    const successMessage = params.get("message");

    feedbackEl.className = "feedback-banner";
    feedbackEl.textContent = "";
    feedbackEl.hidden = true;

    if (errorMessage) {
      feedbackEl.textContent = decodeURIComponent(errorMessage);
      feedbackEl.classList.add("error");
      feedbackEl.hidden = false;
    } else if (successMessage) {
      feedbackEl.textContent = decodeURIComponent(successMessage);
      feedbackEl.classList.add("success");
      feedbackEl.hidden = false;
    }
  }

  function parseVolunteerEntry(rawValue) {
    if (!rawValue) {
      return null;
    }

    const trimmedValue = String(rawValue).trim();
    if (!trimmedValue) {
      return null;
    }

    const hyperlinkMatch = trimmedValue.match(
      /^=HYPERLINK\("([^"]+)"\s*;\s*"([^"]+)"\)$/i
    );

    if (hyperlinkMatch) {
      return {
        label: hyperlinkMatch[2],
        href: hyperlinkMatch[1]
      };
    }

    return {
      label: trimmedValue
    };
  }

  async function fetchAvailabilityData() {
    const endpoint =
      "https://n8n.delugan.net/webhook/juvenes/mensacaritas/slots";

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error(
        `Risposta non valida dal server (${response.status} ${response.statusText})`
      );
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const jsonPayload = await response.json();
      return normalizeAvailabilityPayload(jsonPayload);
    }

    const rawText = await response.text();
    return normalizeAvailabilityPayload(rawText);
  }

  function normalizeAvailabilityPayload(payload) {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    if (typeof payload === "string") {
      const trimmed = payload.trim();
      if (!trimmed) {
        return [];
      }

      const decoded = decodeHtmlEntities(trimmed);

      try {
        return normalizeAvailabilityPayload(JSON.parse(trimmed));
      } catch {
        try {
          return normalizeAvailabilityPayload(JSON.parse(decoded));
        } catch (error) {
          throw new Error("Formato dati non valido: impossibile effettuare il parse.");
        }
      }
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  }

  function renderPlaceholderMessage(message) {
    calendarRoot.innerHTML = `
      <div class="table-wrapper">
        <table role="presentation">
          <tbody>
            <tr>
              <td style="padding: 1.5rem; text-align: center; font-size: 1rem;">
                ${message}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function decodeHtmlEntities(value) {
    const element = document.createElement("textarea");
    element.innerHTML = value;
    return element.value;
  }
})();
