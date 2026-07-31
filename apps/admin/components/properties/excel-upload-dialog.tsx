import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExcelUploadForm } from "@/app/(dashboard)/properties/excel-upload-form";

/**
 * Dialog wrapper around the unmodified bulk-upload flow. No local state of
 * its own — Dialog and ExcelUploadForm already carry their own client
 * interactivity, so this stays a plain composition.
 */
export function ExcelUploadDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          Cargar por Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cargar propiedades</DialogTitle>
        </DialogHeader>
        <ExcelUploadForm />
      </DialogContent>
    </Dialog>
  );
}
