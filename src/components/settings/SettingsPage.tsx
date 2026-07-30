import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountsPanel } from "./AccountsPanel";
import { GeneralSettingsPanel } from "./GeneralSettingsPanel";

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Tabs defaultValue="accounts">
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          <AccountsPanel />
        </TabsContent>
        <TabsContent value="general">
          <GeneralSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
