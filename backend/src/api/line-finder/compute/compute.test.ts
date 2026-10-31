/**
 * Spec examples as tests. Run from `backend/`:
 *   node --import tsx --test src/api/line-finder/compute/compute.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { LINE_FINDER_MATCH_KIND } from "../constants";
import { parseCaptionLines } from "./captions";
import { matchWindow, playerTimes } from "./match";
import { namesPerson } from "./relevance";
import { skeleton, soundForm, soundsOf } from "./sound";

const QUERY = soundsOf("mere paas bahut paisa hai");

test("Hindi and Roman spellings meet", () => {
  const pairs: Array<[string, string]> = [
    ["पैसा", "paisa"],
    ["पास", "paas"],
    ["पास", "pass"],
    ["बहुत", "bahut"],
    ["मेरे", "mere"],
    ["है", "hai"],
    ["शादी", "shaadi"],
    ["शादी", "shadi"],
    ["भाई", "bhai"],
    ["करना", "karna"],
    ["नहीं", "nahin"],
    ["नहीं", "nahi"],
    ["मैं", "main"],
    ["में", "mein"],
    ["पक्का", "pakka"],
    ["समझ", "samajh"],
    ["आएगा", "aayega"],
  ];
  for (const [hindi, roman] of pairs) assert.equal(soundForm(hindi), soundForm(roman), `${hindi} / ${roman}`);
});

test("sound forms and skeletons follow the spec's examples", () => {
  assert.equal(soundForm("पैसा"), "paisa");
  assert.equal(skeleton("paisa"), "ps");
  assert.equal(soundForm("shaadi"), "sadi");
  assert.equal(soundForm("???"), "");
});

test("spec §8: the meme short is Close", () => {
  const match = matchWindow(QUERY, soundsOf("बहुत पैसा है अपने पास तिजोरिया भर रही है"));
  assert.equal(match?.kind, LINE_FINDER_MATCH_KIND.CLOSE);
  assert.equal(match?.saysNo, false);
});

test("spec §8: The Chill Hour line is Similar words", () => {
  const match = matchWindow(QUERY, soundsOf("इसके बाद बहुत पैसा है। इसके बाद बहुत तगड़ी जो है इसका प्रोटोकॉल है।"));
  assert.equal(match?.kind, LINE_FINDER_MATCH_KIND.SIMILAR);
});

test("spec §8: a line that says no is never Close", () => {
  const match = matchWindow(QUERY, soundsOf("चेंज आया है लाइफ में? पैसा मेरे पे पहले भी नहीं था और रियलिटी"));
  assert.equal(match?.kind, LINE_FINDER_MATCH_KIND.SIMILAR);
  assert.equal(match?.saysNo, true);
});

test("the same words side by side are Exact, typed in either script", () => {
  const window = soundsOf("यार मेरे पास बहुत पैसा है भाई");
  assert.equal(matchWindow(QUERY, window)?.kind, LINE_FINDER_MATCH_KIND.EXACT);
  assert.equal(matchWindow(soundsOf("मेरे पास बहुत पैसा है"), window)?.kind, LINE_FINDER_MATCH_KIND.EXACT);
  const match = matchWindow(QUERY, window);
  assert.deepEqual([match?.firstWord, match?.lastWord], [1, 5]);
});

test("a window that says no can't be Exact, unless the query says no too", () => {
  const window = soundsOf("मेरे पास बहुत पैसा है नहीं");
  assert.notEqual(matchWindow(QUERY, window)?.kind, LINE_FINDER_MATCH_KIND.EXACT);
  const query = soundsOf("paisa nahi hai");
  assert.equal(matchWindow(query, soundsOf("पैसा नहीं है यार"))?.kind, LINE_FINDER_MATCH_KIND.EXACT);
});

test("a no in the next sentence doesn't undo exact words", () => {
  const query = soundsOf("paisa khud chalke aayega");
  const match = matchWindow(query, soundsOf("किस्मत में होगा तो पैसा खुद चलके आएगा और नहीं होगा तो रोड पर"));
  assert.equal(match?.kind, LINE_FINDER_MATCH_KIND.EXACT);
});

test("only everyday words in common isn't a match", () => {
  assert.equal(matchWindow(QUERY, soundsOf("मेरे को है वो")), null);
  assert.equal(matchWindow(QUERY, soundsOf("आज मौसम बहुत अच्छा था")), null);
});

test("a typo of one letter still matches on longer words only", () => {
  assert.notEqual(matchWindow(soundsOf("paisaa bahuut"), soundsOf("paysa bahut")), null);
  assert.equal(matchWindow(soundsOf("kal aaj"), soundsOf("kam aam")), null);
});

test("a one-word query can match", () => {
  assert.equal(matchWindow(soundsOf("paisa"), soundsOf("पैसा चाहिए"))?.kind, LINE_FINDER_MATCH_KIND.EXACT);
});

test("player times lead in, lead out and stay at or above 0", () => {
  assert.deepEqual(playerTimes(500, 900), { startSeconds: 0, endSeconds: 7 });
  assert.deepEqual(playerTimes(120_000, 121_500), { startSeconds: 118, endSeconds: 128 });
});

test("captions keep word timing from auto tracks", () => {
  const lines = parseCaptionLines({
    events: [
      { tStartMs: 5279, dDurationMs: 3000, segs: [{ utf8: "बहुत" }, { utf8: " पैसा", tOffsetMs: 241 }, { utf8: " है", tOffsetMs: 401 }] },
      { tStartMs: 8000, segs: [{ utf8: "\n" }] },
    ],
  });
  assert.equal(lines.length, 1);
  assert.deepEqual(soundsOf(lines[0].text), ["bahut", "paisa", "hai"]);
  assert.deepEqual(lines[0].wordMs, [5279, 5520, 5680]);
  assert.deepEqual(lines[0].keys, ["bht", "ps", "h"]);
});

test("human captions have no word timing", () => {
  const [line] = parseCaptionLines({ events: [{ tStartMs: 1000, segs: [{ utf8: "बहुत पैसा है" }] }] });
  assert.equal(line.text, "बहुत पैसा है");
  assert.equal(line.wordMs, null);
});

test("a video must name the person", () => {
  const spellings = ["Puneet Superstar", "Punit Superstar"];
  assert.equal(namesPerson("Bahut paisa hai mere pass meme puneet superstar", spellings), true);
  assert.equal(namesPerson("Punit Superstar EXPOSED", spellings), true);
  assert.equal(namesPerson("पुनीत सुपरस्टार का इंटरव्यू", spellings), true);
  assert.equal(namesPerson("mere pass bahut Paisa Hai #veg #plese", spellings), false);
  assert.equal(namesPerson("Puneet Sharma interview", spellings), false);
});
