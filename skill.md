---
name: make-my-own-social
description: Set the user up with their own small social site — a phone-app-style website friends add to their home screen, with one timeline of everything you post, photo sections, a work page, comments, and a People tab that links to friends' own socials. Use when the user says "make me my own social", "I want my own Instagram/LinkedIn", or shares this file.
---

# Make my own social

You're helping someone leave the big social apps and run their own small one.
Everything is already built in a template — your job is to personalise it and
put it online with them, one step at a time, checking each step worked.

Template: https://github.com/evydeveloper-rgb/make-my-own-social
(Started by Evy — https://evys-social.vercel.app)

## 1. Ask first (one short message)

- Their name and a short lowercase handle (shows as "<handle>'s social").
- One line of bio, and one or two sentences for the intro screen.
- 1–4 photos of themselves (selfies work best).
- Whether they want the Work tab, and what goes on it: headline, location,
  a short about, past roles, links.
- Optional: text for the coloured icon choices (Evy uses "evy"; blank = a dot).

Nothing else up front. Defaults are fine for the rest.

## 2. Personalise

1. Clone the template into a new folder (or "Use this template" on GitHub into
   their own account, then clone that).
2. Put their photos in `selfies/`. Strip location data and shrink them first
   (EXIF transpose, max ~1440px, re-save as JPEG with no EXIF). Square-ish
   face crops make the best icons.
3. Edit `config.js` only: name, handle, ownerPhoto, bio, intro, iconText,
   selfies, iconPhotos, work.
4. Run `python tools/make-icons.py` (needs Pillow) so Android gets real icon
   PNGs for every choice.
5. Open `index.html` through a local server to check it (it runs in demo mode
   with sample posts until Supabase is connected).

Don't change `api/`, `supabase/`, the `/social.json` format, or the
log-in-with-your-social flow — that's what lets everyone's sites work together.
Colours, sections and copy are theirs to change.

## 3. Put it online (free)

1. **Supabase**: create a free project. In the SQL editor run
   `supabase/setup.sql`. Copy the project URL and the anon (public) key.
2. **Vercel**: import their repo (or use the Deploy button in the README). Set
   environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` — or paste the
   two values into `config.js`. Deploy and note the address.
3. **Log in with your own social**: deploy the edge function in
   `supabase/functions/site-login` (`supabase functions deploy site-login`, or
   paste it in the dashboard's Edge Functions editor) and set its secret
   `SITE_ORIGIN` to the site's https address.
   Also deploy `supabase/functions/socials-feed` the same way (no secret needed).
4. **Supabase → Authentication → URL configuration**: set Site URL to the
   address. Optionally turn off "Confirm email" so friends sign up in one step,
   and turn on leaked-password protection.
5. **Owner**: they sign up on their own site, then run the last line of
   `setup.sql` (with their email) to make that account the owner. After a
   refresh they'll see the **+** button.

Check each step worked before the next. Never ask them to paste passwords or
the service-role key into chat — only the URL and anon key are needed.
Mention that free Supabase projects pause after about a week with no visits.

## 4. Hand-off (a few lines)

- Their link, and how to put it on their phone's home screen.
- Posting: log in → **+** → photo, caption, section.
- Members: the **you** tab lists everyone who signs up.
- Instagram and LinkedIn (optional): make a free account at composio.dev. In dashboard.composio.dev, open the project's Settings → API Keys and copy the project key that starts with `ak_` (a `ck_` key won't work). In the **you** tab, paste it under **Your accounts**, then tap **Connect**. Instagram needs a Creator or Business account.
- People tab: anyone who logs in keeps their own list of friends' socials under **Following**, and sees their posts under **Feed**. Logging in with your own social also brings in the people you follow there. `/social.json` shares the owner's list as `following`. On anyone's social they can now
  tap **Log in → Have your own social?** and type their address — no new
  account needed.
