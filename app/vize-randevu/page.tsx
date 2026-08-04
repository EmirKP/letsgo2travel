import type { Metadata } from "next";
import VisaAppointmentClient from "./VisaAppointmentClient";

export const metadata: Metadata = {
  title: "Vize Randevu Asistanı",
  description:
    "Schengen vize randevusu için ülke, şehir ve tarih tercihlerini kaydet; uygunluk kontrollerini tek panelden takip et.",
  alternates: { canonical: "/vize-randevu" },
};

export default function VisaAppointmentPage() {
  return <VisaAppointmentClient />;
}
