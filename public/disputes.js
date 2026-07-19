const form = document.querySelector("#dispute-form"),
  result = document.querySelector("#dispute-result"),
  button = form?.querySelector("button[type=submit]");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  button.disabled = true;
  result.textContent = "Submitting securely…";
  const data = new FormData(form),
    body = Object.fromEntries(data.entries());
  for (const name of [
    "confirmAccuracy",
    "confirmAuthority",
    "confirmNoSensitiveAttachments",
    "privacyAccepted",
  ])
    body[name] = data.has(name);
  try {
    const response = await fetch("/api/public/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "The dispute could not be submitted.");
    form.reset();
    result.textContent = `${payload.message} Intake reference: ${payload.reference}`;
  } catch (error) {
    result.textContent = error.message || "The dispute could not be submitted.";
  } finally {
    button.disabled = false;
  }
});
