type SheetStackEntry = {
  token: symbol;
  close: () => void;
};

const sheetStack: SheetStackEntry[] = [];
const sheetStackListeners = new Set<() => void>();

function notifySheetStackListeners() {
  for (const listener of sheetStackListeners) listener();
}

export function registerSheet(token: symbol, close: () => void) {
  sheetStack.push({ token, close });
  notifySheetStackListeners();
}

export function unregisterSheet(token: symbol) {
  for (let current = sheetStack.length - 1; current >= 0; current -= 1) {
    if (sheetStack[current].token === token) {
      sheetStack.splice(current, 1);
      notifySheetStackListeners();
      return;
    }
  }
}

export function subscribeSheetStack(listener: () => void) {
  sheetStackListeners.add(listener);
  return () => sheetStackListeners.delete(listener);
}

export function isTopSheet(token: symbol) {
  return sheetStack[sheetStack.length - 1]?.token === token;
}

export function hasOpenSheet() {
  return sheetStack.length > 0;
}

export function closeTopSheet() {
  const topSheet = sheetStack[sheetStack.length - 1];
  if (!topSheet) return false;
  topSheet.close();
  return true;
}
