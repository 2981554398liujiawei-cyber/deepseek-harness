# dsh-tool-gpt-web

Model-facing `gpt_web_ask` tool: ask the web-signed-in ChatGPT and read its
reply, so an agent can consult ChatGPT mid-task and adjust its workflow based
on the answer.

## How it works

The plugin registers one tool (`gpt_web_ask`) that shells out to a
**user-level** Playwright bridge, `gpt_web.py`, living under
`$DSH_HOME/gpt-web/` (default `~/.dsh/gpt-web/`). The bridge drives the system
Chrome via Playwright against `https://chatgpt.com/`, reusing a persisted
sign-in session profile at `$DSH_HOME/gpt-web/gpt_profile`. The profile holds
the user's ChatGPT cookies, which is why it lives outside the repository.

## Setup (one time, per machine)

1. Install Playwright for the user's Python: `python -m pip install playwright`
2. Place `gpt_web.py` into `$DSH_HOME/gpt-web/` (see the standalone tool in the
   user project; it must support `login` and `ask` subcommands).
3. Sign in once: `python gpt_web.py login` from `$DSH_HOME/gpt-web` — a Chrome
   window opens, the user signs in, and the session is saved to
   `gpt_profile/`. The tool's `mode="login"` can also drive this from the model.

## Tool contract

- `mode=ask` (default): send `question`, wait up to `timeout` seconds (default
  180) for the reply, return the reply text. Requires an existing session.
- `mode=login`: open a browser window and wait up to `wait` seconds (default
  300) for the user to sign in.

## Caveats

- The web ChatGPT surface has anti-automation risk control; keep call
  frequency low and prefer headed (`headless: false`) runs.
- The bridge depends on ChatGPT's DOM (`#prompt-textarea`,
  `[data-message-author-role="assistant"]`); an OpenAI redesign may require
  updating `gpt_web.py`.
- Environment override: `DSH_GPT_WEB_PYTHON` selects the Python executable
  (default `python`).
