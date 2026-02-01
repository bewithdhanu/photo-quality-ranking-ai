import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import Home from "./pages/Home";
import AlbumView from "./pages/AlbumView";
import Upload from "./pages/Upload";
import PersonPhotos from "./pages/PersonPhotos";
import PhotoDetail from "./pages/PhotoDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="photo-ranking-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/album/:albumId" element={<AlbumView />} />
              <Route path="/album/:albumId/upload" element={<Upload />} />
              <Route
                path="/album/:albumId/person/:personIndex"
                element={<PersonPhotos />}
              />
              <Route
                path="/album/:albumId/photo/:filename"
                element={<PhotoDetail />}
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
