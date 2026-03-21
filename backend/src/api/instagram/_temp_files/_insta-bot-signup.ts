import type { Page } from "puppeteer";
import { DEFAULT_ELEMENT_LOAD_TIMEOUT } from "../../../utils/constants.js";
import { browserDebugger } from "../../../utils/browser-batch-handler.js";

export type InstagramSignupFormData = {
  emailOrPhone: string;
  password: string;
  fullName: string;
  username: string;
  birthday: {
    month: string;
    day: number;
    year: number;
  };
};

export const MAIN_SCOPE = 'div[role="main"]';
const TYPING_DELAY_MS = 80;
const CONFIRM_NAVIGATION_TIMEOUT_MS = 25_000;

export async function fillInstagramSignupForm(
  page: Page,
  data: InstagramSignupFormData,
  options: { submit?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { submit = true } = options;

  try {
    await page.waitForSelector(`${MAIN_SCOPE} input`, {
      timeout: DEFAULT_ELEMENT_LOAD_TIMEOUT,
    });

    const emailInput = await page.$(`${MAIN_SCOPE} input[type="text"]`);
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(data.emailOrPhone, { delay: TYPING_DELAY_MS });
    }

    const passwordInput = await page.$(`${MAIN_SCOPE} input[type="password"]`);
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(data.password, { delay: TYPING_DELAY_MS });
    }

    const combos = await page.$$(`${MAIN_SCOPE} div[role="combobox"]`);
    if (combos.length >= 3) {
      await combos[0].click();
      await browserDebugger(0.2);
      await clickOption(page, data.birthday.month);
      await browserDebugger(0.15);

      await combos[1].click();
      await browserDebugger(0.2);
      await clickOption(page, String(data.birthday.day));
      await browserDebugger(0.15);

      await combos[2].click();
      await browserDebugger(0.2);
      await clickOption(page, String(data.birthday.year));
      await browserDebugger(0.15);
    }

    const textInputs = await page.$$(`${MAIN_SCOPE} input[type="text"]`);
    if (textInputs.length >= 2) {
      const fullNameInput = textInputs[1];
      await fullNameInput.click({ clickCount: 3 });
      await fullNameInput.type(data.fullName, { delay: TYPING_DELAY_MS });
    }

    const usernameInput =
      (await page.$(`${MAIN_SCOPE} input[aria-label="Username"]`)) ??
      (await page.$(`${MAIN_SCOPE} input[type="search"]`));
    if (usernameInput) {
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.type(data.username, { delay: TYPING_DELAY_MS });
    }

    if (submit) {
      await browserDebugger(3);
      const submitted = await clickSubmitButton(page);
      if (!submitted) {
        return { ok: false, error: "Submit button not found or not clickable" };
      }
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

async function clickOption(page: Page, text: string): Promise<void> {
  const clicked = await page.evaluate((optionText) => {
    const options = document.querySelectorAll<HTMLElement>(
      'div[role="listbox"] div[role="option"]',
    );
    const normalized = optionText.trim().toLowerCase();
    for (const opt of options) {
      if (opt.textContent?.trim().toLowerCase() === normalized) {
        opt.click();
        return true;
      }
    }
    return false;
  }, text);

  if (!clicked) {
    throw new Error(`Option not found: ${text}`);
  }
}

async function clickMainButton(
  page: Page,
  buttonText: string,
): Promise<boolean> {
  const buttons = await page.$$(`${MAIN_SCOPE} div[role="button"]`);
  const normalized = buttonText.trim().toLowerCase();
  for (const btn of buttons) {
    const text = await page.evaluate(
      (el) => el.textContent?.trim().toLowerCase() ?? "",
      btn,
    );
    if (text.includes(normalized)) {
      await btn.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await btn.click();
      return true;
    }
  }
  return false;
}

async function clickSubmitButton(page: Page): Promise<boolean> {
  return clickMainButton(page, "Submit");
}

export async function fillInstagramConfirmationCode(
  page: Page,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await page.waitForSelector(`${MAIN_SCOPE} input[maxlength="6"]`, {
      timeout: DEFAULT_ELEMENT_LOAD_TIMEOUT,
    });
    const codeInput = await page.$(`${MAIN_SCOPE} input[maxlength="6"]`);
    if (!codeInput) {
      return { ok: false, error: "Confirmation code input not found" };
    }
    await codeInput.click({ clickCount: 3 });
    await codeInput.type(code, { delay: TYPING_DELAY_MS });

    await codeInput.evaluate((el) => (el as HTMLInputElement).blur());
    await browserDebugger(1);

    const navPromise = page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: CONFIRM_NAVIGATION_TIMEOUT_MS,
    });
    const clicked = await clickMainButton(page, "Continue");
    if (!clicked) {
      return { ok: false, error: "Continue button not found or not clickable" };
    }
    try {
      await navPromise;
    } catch {
      return {
        ok: false,
        error:
          "Continue clicked but page did not navigate within timeout. Instagram may have blocked the request or shown an error.",
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
