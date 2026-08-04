"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import Link from "next/link";
import styles from "./CountryPermissionGate.module.css";

interface Props {
  countryCode: string;
  permission: 'answer' | 'comment' | 'warning';
  children: React.ReactNode;
}

export default function CountryPermissionGate({ countryCode, permission, children }: Props) {
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    async function checkPermission() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }
      setIsLoggedIn(true);

      const { data } = await supabase
        .from('country_experience_permissions')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('country_code', countryCode)
        .maybeSingle();

      if (data) {
        if (permission === 'answer') setHasPermission(data.can_answer);
        if (permission === 'comment') setHasPermission(data.can_comment);
        if (permission === 'warning') setHasPermission(data.can_create_warning);
      } else {
        setHasPermission(false);
      }
      setLoading(false);
    }
    
    if (countryCode) {
      checkPermission();
    } else {
      // If no country is selected yet, just let them see the content (e.g. they are about to select a country)
      setHasPermission(true);
      setLoading(false);
    }
  }, [countryCode, permission]);

  if (loading) {
    return <div className={styles.loading}>Yetki kontrol ediliyor...</div>;
  }

  if (!isLoggedIn) {
    return (
      <div className={`l2t-belgeli-gezgin-card ${styles.card}`}>
        <p className={styles.message}>Bu alanda işlem yapmak için giriş yapmalısınız.</p>
        <Link href="/auth/login?next=/profil/dogrulamalar" className="l2t-belgeli-gezgin-btn">
          Giriş Yap
        </Link>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className={`l2t-belgeli-gezgin-card ${styles.card}`}>
        <p className={styles.message}>
          Bu ülke hakkında içerik üretmek (cevap/yorum/uyarı) için önce bu ülkeye gittiğinizi doğrulamanız gerekiyor.
        </p>
        <Link href="/profil/dogrulamalar" className="l2t-belgeli-gezgin-btn">
          Ülkeyi Doğrula
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
