"use client";

import { useState, useEffect } from "react";
import { useTripStore } from "../store/tripStore";
import { motion, AnimatePresence } from "framer-motion";
import { Plane, MapPin, X, Bookmark, ExternalLink } from "lucide-react";
import Link from "next/link";

export default function TripDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { savedTrips, removeTrip } = useTripStore();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="trip-dash-btn"
        aria-label="Seyahat Panosu"
      >
        <Bookmark size={20} />
        {savedTrips.length > 0 && <span className="trip-dash-badge">{savedTrips.length}</span>}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="trip-dash-overlay"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="trip-dash-panel glass-panel"
            >
              <div className="trip-dash-header">
                <h2>Seyahat Panom</h2>
                <button onClick={() => setIsOpen(false)}><X size={24} /></button>
              </div>

              <div className="trip-dash-content">
                {savedTrips.length === 0 ? (
                  <div className="trip-dash-empty">
                    <MapPin size={48} opacity={0.2} />
                    <p>Henüz kayıtlı bir planın yok.</p>
                    <Link href="/kampanyalar" onClick={() => setIsOpen(false)} className="l2t-text-link">Fırsatları Keşfet</Link>
                  </div>
                ) : (
                  <div className="trip-dash-list">
                    {savedTrips.map((trip) => (
                      <div key={trip.id} className="trip-dash-item glow-card">
                        <div className="trip-info">
                          <span className="trip-type">
                            {trip.type === "flight" ? <Plane size={14} /> : <MapPin size={14} />}
                            {trip.type === "flight" ? "Uçuş" : trip.type === "ai_plan" ? "AI Planı" : "Rehber"}
                          </span>
                          <h3>{trip.title}</h3>
                          <p>{trip.subtitle}</p>
                        </div>
                        <div className="trip-actions">
                          <a href={trip.url} target={trip.url.startsWith("http") ? "_blank" : "_self"} className="trip-go-btn">
                            <ExternalLink size={16} /> Git
                          </a>
                          <button onClick={() => removeTrip(trip.id)} className="trip-remove-btn">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
