import VideoStudio from "@/components/VideoStudio";

export const metadata = {
  title: "Vídeo Studio · Guion de escenas a vídeo animado",
  description: "Pega un guion de escenas, previsualízalo y grábalo como vídeo animado en tu navegador. Sin audio, sin subir nada a ningún servidor y sin publicar.",
};

export default function Page() {
  return <VideoStudio />;
}
