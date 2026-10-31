# Search specification — LineFinder

This is to LineFinder what the game design spec is to a game: the rules, step
by step, with examples. If code and this document disagree, one of them is a bug.

## 1. Words used here

| Word | Meaning |
| --- | --- |
| Person | Someone searchable. Has a name and other spellings |
| Pool | The videos collected for a person |
| Line | One caption line, with its start time and word timing |
| Window | A line plus the next line. A spoken sentence often crosses two |
| Sound form | A word rewritten so Hindi and Roman spellings meet: `पैसा` and `paisa` both become `paisa` |
| Skeleton | The sound form without its inner vowels: `paisa` becomes `ps`. Used to find candidates quickly |

## 2. Collecting a person

1. Run YouTube searches for the name and each other spelling, alone and with
   `interview`, `podcast`, `meme` and `shorts`.
2. Add their own channel's videos if a handle was given.
3. Keep a video only if its title or description contains the person's name or
   a spelling of it, or it's on their own channel.

   `mere pass bahut Paisa Hai #veg` is dropped. A 15-second clip titled
   `Bahut paisa hai mere pass meme puneet superstar` is kept. Short clips matter:
   that is where the famous lines live.

4. For each video, in order of views, up to 200 per person, fetch captions:
   - Hindi first, then English, then whatever is first. Human-written over
     automatic.
   - Keep word timing.
5. Record every outcome: searched, no captions, or failed. "Not found" reads these.

### When collection stops itself

- 10 failures in a row: paused with "YouTube is refusing right now".
- Daily proxy limit reached: paused with "Daily proxy limit reached".
- A restart continues from the videos not yet done.
- A video already collected for another person isn't fetched again.

## 3. Sound forms

Lower-case everything, drop punctuation, then:

| Step | Rule | Example |
| --- | --- | --- |
| Hindi to Roman | Letter by letter. A consonant with no vowel sign gets `a`, except at the end of a word | `बहुत` → `bahut`, `मेरे` → `mere`, `पास` → `pas` |
| Long vowels | `aa`→`a`, `ee`→`i`, `oo`→`u` | `paas` → `pas`, `shaadi` → `sadi` |
| Vowel, `y`, vowel | Drop the `y` | `aayega` → `aega`, `आएगा` → `aega` |
| Sounds alike | `sh`→`s`, `ph`→`f`, `w`→`v`, `z`→`j`, `q`→`k`, `ck`→`k` | `शादी` → `sadi` |
| Breathy | Drop `h` after a consonant | `bhai` → `bai`, `भाई` → `bai` |
| Doubles | Collapse repeats | `pakka` → `paka` |

So all of these meet: `paisa` / `पैसा`, `paas` / `pass` / `पास`, `shaadi` /
`shadi` / `शादी`.

**Known limit:** English written in Hindi script doesn't always meet its English
spelling. `एवरी` becomes `avari`, not `every`. Meaning-based search is the Phase 2 fix.

## 4. Finding and ranking

1. **Candidates.** Search the person's finished videos for windows sharing any
   skeleton with the query, leaving out everyday words unless that's all it has.
   Keep the 400 that share the most.
2. **Score each candidate.** Compare query words with window words, in any order,
   because Hindi word order is loose. A word matches if its sound form is equal,
   or one letter off for words of 4 or more letters. Everyday words count for
   less: `hai` and `mere` count for 0.4, `paisa` and `bahut` for 1.

   ```text
   score = matched weight ÷ total query weight
   ```

3. **Keep the best per moment.** Windows within 10 seconds in one video count as
   one result.
4. **Label and sort.**

| Label | Rule |
| --- | --- |
| **Exact** | Every query word, next to each other, in order |
| **Close** | Score 0.75 or more |
| **Similar words** | Score 0.45 or more, at least 2 words match, one of them not an everyday word |
| Not shown | Anything lower |

Sort by label, then score, then views. Return at most 20.

5. **The opposite check.** If `nahi` or `mat` is among the matched words or just
   after them, and the query doesn't have one, the result can't be Exact or Close,
   and it shows "Says no, may mean the opposite". "Just after" is 1 word for exact
   words and 4 for looser ones. Further away, it belongs to another sentence:
   `पैसा खुद चलके आएगा और नहीं होगा` is still Exact for "paisa khud chalke aayega".
   `पैसा मेरे पे पहले भी नहीं था` must never rank as Close for "mere paas bahut
   paisa hai". `na` isn't included, because it often just ends a sentence ("hai na?").

## 5. Where the player starts

- Start 2 seconds before the first matched word, using word timing. If a line
  has no word timing, 2 seconds before the line.
- End 6 seconds after the last matched word. YouTube's `end` counts from the start
  of the video, not from `start`.
- Never below 0. The link is `youtube.com/watch?v=ID&t=SECONDSs`.

## 6. Who is speaking

Captions don't say who is speaking, so every result carries one of these:

| Label | Meaning | Comes from |
| --- | --- | --- |
| **Confirmed** | A person checked it | An admin's mark. Nothing else can set it |
| **Likely** | The words around it read as this person speaking | The check below |
| **Someone else** | The words read as someone else saying it, or someone talking about them | The check below, or an admin's mark |
| **Not checked** | The check hasn't run or failed | Default |

**The check:** the 8 best results, on each search. An AI model reads the title, channel
and about 60 seconds of captions around the match, then answers `likely`,
`someone_else` or `unsure`. `unsure` is shown as Not checked. The answer is saved, so
one moment is only ever checked once. If the check fails, results still show.

The title of a short clip isn't proof. A clip titled with the person's name is at most
Likely until someone marks it.

## 7. What each search can say

| State | When | Page says |
| --- | --- | --- |
| Found | At least one Exact | The results |
| Closest | No Exact, at least one Close or Similar | "We didn't find those exact words. These are the closest." |
| Not found | Nothing to show | "We couldn't find this line in {n} videos of {person}." |
| Not collected | The person has no searched videos | "We haven't collected this person yet." |

Found, Closest and Not found also say: "Searched {n} videos. {m} had no captions, so we
couldn't search them." While collection is running: "Still collecting, try again soon."

## 8. Worked example

Person: Puneet Superstar. Line: `mere paas bahut paisa hai`.
From a test on 18 real videos and 34,022 lines:

| Video | Captions | Expected |
| --- | --- | --- |
| Meme short, 0:00 | `बहुत पैसा है अपने पास तिजोरिया भर रही है` | Close. All words match except `mere`, and not in the same order |
| The Chill Hour, 36:40 | `इसके बाद बहुत पैसा है...` | Similar words or Close, labelled by the check |
| Akanksha Podcast, 0:13 | `पैसा मेरे पे पहले भी नहीं था` | Similar words at most, with "Says no, may mean the opposite" |
| `mere paas bahut paisa hai` exactly | Nowhere | State is **Closest**, not Found |

These four cases are written into the test file.
