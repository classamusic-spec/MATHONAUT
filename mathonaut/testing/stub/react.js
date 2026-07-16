// The React wrapper is stubbed for headless tests — createGame() has no framework
// dependency, which is precisely why the game core is testable without a browser.
module.exports = { useEffect: () => {}, useRef: () => ({ current: null }) };
