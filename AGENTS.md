# Project Instructions & Persistent Rules

## Typography Rules
- The font family for `.font-mono`, technical labels, numbers, codes, order details, and secondary notices is strictly **Lato Condensed** (`'Lato Condensed', 'Lato', 'Arial Narrow', sans-serif`).
- `IBM Plex Mono`, `Arial Narrow`, and `Open Sans Condensed` have been replaced with **Lato Condensed** / **Lato** across all storefront and admin modules. All future implementations using monospace, receipt, order, or technical labels must use Lato Condensed (`font-mono` / `'Lato Condensed', 'Lato', sans-serif`).
- Headings and section titles use **Roboto Condensed Regular** (weight 400).
- Body and layout text use **Lato Condensed** / **Lato** / sans-serif.

## Checkout UI Rules
- In the multi-step checkout modal header, never display verbose or highlighted badges like "STEP 1 OF 4" or pills with colored borders/backgrounds.
- Always display a clean, unhighlighted step counter strictly formatted as `1/4`, `2/4`, `3/4`, or `4/4` in neutral text (`text-gray-500 font-mono`).

## Viewport & Orientation Lock Rules
- Both the shopfront (`/`) and admin (`/admin`) pages must strictly be locked to a portrait mobile view dimension (`max-w-[430px]` centered horizontally with `mx-auto`).
- When opened on tablet or desktop screens, the app must never expand into a wide layout; it must continue rendering the portrait mobile view size inside a centered phone container with a dark neutral backdrop (`bg-slate-950`).
- All interactive sheets, drawers, and modal dialogs across shopfront and admin must also stay locked to this mobile portrait dimension (`max-w-[430px]`).
