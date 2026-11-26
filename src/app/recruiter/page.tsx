import { RobotChatClient } from "@/components/recruiter/RobotChatClient";
import { aboutPhoto } from "@/content/aboutPhoto";
import { About, Contact, Footer, Hero, Journey, Projects, Skills, TopNav } from "@/components/recruiter/sections";

export default function RecruiterPage() {
  return (
    <>
      <TopNav />
      <main id="top">
        <Hero />
        <About photo={aboutPhoto()} />
        <Projects />
        <Skills />
        <Journey />
        <Contact />
      </main>
      <Footer />
      <RobotChatClient />
    </>
  );
}
