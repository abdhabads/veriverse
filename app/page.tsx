import type { Metadata } from "next";
import Navbar from "@/components/home/Navbar";
import Hero from "@/components/home/Hero";
import WhatIsVeriVerse from "@/components/home/WhatIsVeriVerse";
import PipelineSteps from "@/components/home/PipelineSteps";
import TrustVerdicts from "@/components/home/TrustVerdicts";
import WhyRegister from "@/components/home/WhyRegister";
import LiveExamples from "@/components/home/LiveExamples";
import FinalCTA from "@/components/home/FinalCTA";
import Footer from "@/components/home/Footer";

export const metadata: Metadata = {
  title: "VeriVerse — Check what the evidence says",
  description:
    "VeriVerse is a social platform that checks claims against real evidence and shows you what it finds — not just whether the words sound safe. Post, vote, and follow the people getting it right.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen" style={{ background: "#F5EEE2" }}>
      <Navbar />
      <Hero />
      <WhatIsVeriVerse />
      <PipelineSteps />
      <TrustVerdicts />
      <WhyRegister />
      <LiveExamples />
      <FinalCTA />
      <Footer />
    </main>
  );
}
