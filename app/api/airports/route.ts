import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(`https://autocomplete.travelpayouts.com/places2?locale=tr&types[]=airport&types[]=city&types[]=country&term=${encodeURIComponent(q)}`);
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    
    // Format to match LocationItem
    const formatted = data.map((item: any) => ({
      id: item.id || item.code,
      name: item.name,
      type: item.type === "country" ? "country" : "city",
      countryName: item.country_name,
      code: item.code
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    return NextResponse.json([]);
  }
}
