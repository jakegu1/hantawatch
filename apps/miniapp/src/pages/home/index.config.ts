export default definePageConfig({
  // Pull-to-refresh: lets users manually re-pull live clusters + imports
  // (otherwise data only refreshes on mount / re-show). Background colour
  // matches the hero gradient top so the pull area feels seamless; light
  // text style keeps the spinner visible on the dark background.
  enablePullDownRefresh: true,
  backgroundColor: '#1e3a8a',
  backgroundTextStyle: 'light',
});
