# Story Engine: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source (one folder per component under `project/components/`);
`play/` is the committed web build. Do not hand-edit `play/`, rebuild it. Work through the NodeGX MCP server
(`get_component`, `update_component`, `validate_project`, `render_report`) or the NodeGX editor; if you edit JSON by
hand keep the 2-space format and unique node ids, and validate.

## Component map

- `Pages/Read` (`/`): reads the story: the current passage, its visible choices, what you carry.
- `Pages/Remix` (`#/remix`): a box holding the story as JSON; paste, check, play.
- `Story/Source`: the one place the story lives, and the switch between the shipped story and a pasted one. Both pages
  place it.
- `Story/Passage`: a `States` node with three states (reading, an ending, a missing passage).
- `Story/Choice`: one choice row; it publishes what was clicked to the repeater that drew it.
- `Story/Carried`, `Story/Sidebar`: what the reader carries. `Story/Paster`: the remix box and its error messages.
- `App`: the router and the look. `noodl_modules/story-engine-fonts`: Source Serif 4 for the prose.

## Where the content lives

| What | Component | Node |
|---|---|---|
| The story (every passage) | `Story/Source` | Static Data "EDIT — your story — every passage, in this one list" (7) |

## How to add a passage or a whole story

1. In `Story/Source`, add `{ "id": "cellar", "title": "The cellar", "text": "…", "choices": [ … ] }`.
   Every `id` is unique. A choice is `{ "label", "goto": "<id>" }`, plus `"gives": "a brass key"` to hand something
   over, or `"requires": "a brass key"` to show it only to a reader who carries that thing. No `choices` = an ending.
2. Point at least one existing choice's `goto` at the new passage.
3. The first passage in the list is where reading starts.
4. Test it on the remix page first (paste, Read this story): a bad `goto` is named there.
5. Validate, rebuild `play/`.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /story-engine/
```

`--base-url /story-engine/` is required (without it the page is blank there). The report must say
`"engine": { "kind": "production" }`; never ship `--allow-development-engine`. Hash navigation is on, so the remix
page is `/story-engine/#/remix` on a static host.
