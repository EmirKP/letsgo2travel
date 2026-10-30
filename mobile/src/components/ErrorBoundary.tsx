import { Component, type ErrorInfo, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";

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
    const messages = {
      tr: ["Uygulama açılırken bir sorun oluştu", "Tekrar denediğinde kayıtların korunur.", "Tekrar dene"],
      en: ["The app could not be opened", "Your saved items are kept when you try again.", "Try again"],
      sq: ["Aplikacioni nuk u hap", "Regjistrimet e tua ruhen kur provon përsëri.", "Provo përsëri"],
      ro: ["Aplicația nu s-a putut deschide", "Datele salvate se păstrează când încerci din nou.", "Încearcă din nou"],
    };
    const language = document.documentElement.lang;
    const [title, description, retry] = messages[language as keyof typeof messages] || messages.tr;
    return (
      <main className="fatal-screen">
        <div className="fatal-logo"><BrandMark /></div>
        <h1>{title}</h1>
        <p>{description}</p>
        <button onClick={() => window.location.reload()}>{retry}</button>
      </main>
    );
  }
}
