import { usePage } from "@/contexts/PageStore";
import PageLayout from "@/components/common/PageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialpad } from "./Dialpad";
import { PhoneDisplay } from "./PhoneDisplay";
import { CallActions } from "./CallActions";
import { UseWebDialerPageReturn } from "../_hooks/useWebDialerPage";

export function WebDialerContent() {
  const {
    identity,
    status,
    phoneNumber,
    isInCall,
    isCallDisabled,
    handleDialpadClick,
    handleDialpadLongPress,
    handleBackspace,
    handlePhoneNumberChange,
    makeCall,
    hangup,
  } = usePage<UseWebDialerPageReturn>();

  return (
    <PageLayout className="space-y-3" title="Web dialer">
      <div className="flex items-center justify-center min-h-full">
        <Card className="w-full max-w-md mx-auto shadow-xl">
          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {identity && `Identity: ${identity}`}
              </span>
              <Badge
                variant={
                  status === "registered"
                    ? "default"
                    : status === "in-call"
                      ? "default"
                      : "secondary"
                }
                className="capitalize"
              >
                {status.replace("-", " ")}
              </Badge>
            </div>

            {/* Phone Display */}
            <PhoneDisplay
              value={phoneNumber}
              onChange={handlePhoneNumberChange}
              onBackspace={handleBackspace}
            />

            {/* Dialpad */}
            <Dialpad 
              onButtonClick={handleDialpadClick}
              onLongPress={handleDialpadLongPress}
            />

            {/* Call Actions */}
            <CallActions
              onCall={makeCall}
              onHangup={hangup}
              isCallDisabled={isCallDisabled}
              isInCall={isInCall}
              className="pt-4"
            />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
