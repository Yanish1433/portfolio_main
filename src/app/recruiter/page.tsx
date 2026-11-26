import { RobotChatClient } from "@/components/recruiter/RobotChatClient";
import { Contact, Footer, Hero, Journey, Projects, Skills, TopNav } from "@/components/recruiter/sections";

export default function RecruiterPage() {
  return (
    <>
      <TopNav />
      <main id="top">
        <Hero />
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
