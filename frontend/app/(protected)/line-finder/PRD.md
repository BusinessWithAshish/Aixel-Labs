# Product requirements document — LineFinder

## 1. Summary

Editors making commentary, recap and meme videos often need one thing: a known
person saying a specific line. Today that means opening a dozen long podcasts
and scrubbing through them, often for hours.

LineFinder takes a person and a line and returns the exact moment on YouTube.
The editor clicks through to that second. If the line isn't there, LineFinder
says so and shows what it searched, so the editor can stop looking.

The formula is always the same: **X personality saying Y**.

## 2. Goals

- Go from a person and a half-remembered line to the right second in under 10
  seconds.
- Work for Hindi as people actually type it: Roman script, loose wording.
- Never overstate. Every result says how close the words are and how sure we
  are about who is speaking.
- "Not found" is a useful answer, not an empty page.
- Hand out links, never footage.

## 3. Non-goals for v1

- Downloading, cutting or exporting video, or linking to tools that do.
- Visual moments: laughing, crying, dancing, b-roll. Captions can't find them.
- Platforms other than YouTube.
- Transcribing videos with no captions. That means downloading the audio.
- User-supplied API keys. A search reads our index and never touches YouTube.
- Paid API keys for agencies. Considered for Phase 3.

## 4. Users and journeys

| User | Need | Journey |
| --- | --- | --- |
| Commentary or recap editor | One exact line for a video due today | Pick the person, type the line, press Find, play the moment, open it on YouTube. |
| Meme editor | A remembered line, wording unsure | Types it loosely, sees close matches with the real words, picks one. |
| Editor whose line doesn't exist | To stop searching | Sees "not found", with how many videos were searched and how many had no captions. |
| Admin (Phase 1) | A person to be searchable | Adds the person on People, watches collection progress, marks results right or wrong. |

## 5. v1 scope

### Search page

- One person picker and one line box
- Results ranked by closeness, each with:
  - **Match label:** Exact, Close, or Similar words
  - **Speaker label:** Confirmed, Likely, Someone else, or Not checked
  - The line in the captions, with the lines before and after it
  - A player that starts at that moment, loaded on click
  - An "Open on YouTube at 36:40" link
  - Video title, channel, views
  - A rights note: "Owned by this channel. Reusing it may get a copyright claim."
- A not-found panel: what we searched, what we couldn't search, closest lines if
  any

### People page (admins)

- Add a person: name, other spellings, their own YouTube handle if any
- Progress per person: videos found, searched, no captions, failed
- Collection stops itself and says why when YouTube starts refusing or the
  daily proxy limit is reached. Resume with a button
- Remove a person

### Marking results (admins)

- "Right person" and "Wrong person" on a result set the speaker label to
  Confirmed or Someone else for good. This also feeds the accuracy test.

### Later phases, not v1

| Item | Phase |
| --- | --- |
| Credits and paid plan | 2 |
| Takedown form, channel and person opt-out, blocklist | 2, before anyone outside the team uses it |
| Daily check for deleted videos | 2 |
| Grouping copied uploads, official channel first | 2 |
| Meaning-based search | 2 |
| Any person on request | 3 |
| Tamil and Telugu | 3 |
| Paid API keys | 3 |

## 6. Experience requirements

- Plain English on every label. No "ASR", "diarization" or "confidence score".
- The answer is visible without scrolling on a laptop: the best match's words,
  labels and link come first.
- Full width on desktop, single column on a phone.
- A player never autoplays and never loads until asked, so a page of results
  stays fast.
- A wrong label is worse than no label. If a check failed, it says Not checked.
- The not-found panel never blames the user or hides the count.

## 7. Success measures

Phase 1 gate, on 5 personalities and 100 real searches from YouTube autocomplete,
marked by hand:

- The right moment is in the top 3 on at least 80% of searches.
- Likely is correct on at least 80% of labelled results, and Confirmed on at
  least 95%.

Phase 2 gate, on 50 personalities: at least 5 of 20 editors pay and still use it
after 2 weeks.

If speaker labels fail the Phase 1 gate, the product is sold as "where this line
appears", without speaker claims.

## 8. Release sequence

1. **Docs** (this step): scope and rules agreed.
2. **Engine:** caption parsing with word timing, sound matching, index, search,
   collection, with tests on real captions.
3. **Pages:** Search and People, behind the flag.
4. **Accuracy test:** 5 personalities, 100 searches, one results table.
5. **Private launch:** tenant record, `linefinder.aixellabs.in`, env vars, deploy.
6. **Paid test:** 50 personalities, credits, takedown, 20 editors. Lawyer session
   before this opens to anyone outside the team.
7. **Scale:** any person on request, more languages, public launch.

## 9. Product decisions

- Domain: `linefinder.aixellabs.in`.
- No downloads. YouTube's terms allow the embedded player.
- Sign-in required, unlike the games, so it's a normal internal tenant with its own
  module access and not a product tenant.
- Collecting captions remains the main legal and business risk. YouTube's terms
  bar automated access, and it can close the route at any time. Search keeps
  working from the index if it does.
