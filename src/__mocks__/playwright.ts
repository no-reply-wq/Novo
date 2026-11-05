/** Playwright mock — prevents import errors in test environment */
export const chromium = {
  launch: () => Promise.resolve({
    newPage: () => Promise.resolve({
      setContent: () => Promise.resolve(),
      pdf: () => Promise.resolve(Buffer.from('')),
      close: () => Promise.resolve(),
    }),
    close: () => Promise.resolve(),
  }),
};
