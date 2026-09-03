import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("LetsGo2Travel mobile render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const english = document.documentElement.lang === "en";
    return (
      <main className="fatal-screen">
        <div className="fatal-logo">LetsGo<span>2</span>Travel</div>
        <h1>{english ? "The app could not be opened" : "Uygulama açılırken bir sorun oluştu"}</h1>
        <p>{this.state.error.message || (english ? "An unexpected error occurred." : "Beklenmeyen bir hata oluştu.")}</p>
        <button onClick={() => window.location.reload()}>{english ? "Try again" : "Tekrar dene"}</button>
      </main>
    );
  }
}
