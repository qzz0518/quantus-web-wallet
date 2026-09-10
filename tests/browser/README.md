# Amount layout regression

Run `mise run dev`, then open `/tests/browser/amount-layout.html` on the local development server. This fixture renders the real wallet components with simulated public balances. It does not create a vault, connect to the chain or sign transactions, and is not included in the production build.

In the browser console, `amountLayout.renderCase(index, hidden)` selects a case and `amountLayout.check()` verifies precision, number/currency separation, minimum text size and horizontal bounds. `amountLayout.cases` lists the scenarios, including the reported `101.861966975` balance, the old length cutoff, twelve decimals and the maximum chain amount.

Check light and dark themes at widths 320, 360, 375, 393, 430, 768 and 1440, and repeat after resizing without a reload. An empty `errors` list is a pass. This requires a real browser layout engine; server-rendered markup tests cannot detect text overlap.
