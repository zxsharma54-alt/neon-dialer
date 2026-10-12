package com.neondialer.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "DirectCall",
    permissions = {
        @Permission(
            alias = "call",
            strings = { Manifest.permission.CALL_PHONE }
        )
    }
)
public class DirectCallPlugin extends Plugin {

    private static final String CALL_PERMISSION_ALIAS = "call";
    private static final String CHANNEL_ID = "call_waiting";
    private static final int NOTIFICATION_ID = 2001;

    private PhoneStateListener callWaitingListener;
    private TelephonyManager telephonyManager;
    private boolean wasOffHook = false;

    // ==================== CALLING (unchanged) ====================

    @PluginMethod
    public void callNumber(PluginCall call) {
        String raw = call.getString("number");
        if (raw == null) {
            call.reject("no number");
            return;
        }

        String clean = raw.replaceAll("[^0-9+]", "").replace("+", "").trim();
        if (clean.length() == 11 && clean.startsWith("0")) clean = clean.substring(1);
        if (clean.length() == 10) clean = "91" + clean;

        if (clean.isEmpty()) {
            call.reject("invalid number");
            return;
        }

        if (getPermissionState(CALL_PERMISSION_ALIAS) != PermissionState.GRANTED) {
            requestPermission(CALL_PERMISSION_ALIAS, "onCallPermissionResult", call);
            return;
        }

        doCall(clean, call);
    }

    @PermissionCallback
    private void onCallPermissionResult(PluginCall call) {
        if (getPermissionState(CALL_PERMISSION_ALIAS) == PermissionState.GRANTED) {
            String raw = call.getString("number");
            String clean = raw.replaceAll("[^0-9+]", "").replace("+", "").trim();
            if (clean.length() == 11 && clean.startsWith("0")) clean = clean.substring(1);
            if (clean.length() == 10) clean = "91" + clean;
            doCall(clean, call);
        } else {
            call.reject("CALL_PHONE permission not granted, please allow in Settings");
        }
    }

    private void doCall(String clean, PluginCall call) {
        String telUri = "tel:" + clean;
        Log.d("NEON_CALL", "Dialing: " + telUri);
        try {
            Intent intent = new Intent(Intent.ACTION_CALL);
            intent.setData(Uri.parse(telUri));
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (SecurityException se) {
            Log.e("NEON_CALL", "SecurityException: " + se.getMessage());
            call.reject("CALL_PHONE permission not granted, please allow in Settings");
        } catch (Exception e) {
            Log.e("NEON_CALL", "Exception: " + e.getMessage());
            call.reject(e.getMessage());
        }
    }

    // ==================== WHATSAPP (unchanged) ====================

    @PluginMethod
    public void openWhatsApp(PluginCall call) {
        String n = call.getString("number");
        if (n == null || n.isEmpty()) {
            call.reject("Number is required");
            return;
        }
        n = n.replaceAll("[^0-9]", "");
        if (n.length() == 10) n = "91" + n;
        if (n.startsWith("0")) n = n.substring(1);

        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setData(Uri.parse("https://wa.me/" + n));
            i.setPackage("com.whatsapp");
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            try {
                Intent i2 = new Intent(Intent.ACTION_VIEW);
                i2.setData(Uri.parse("https://wa.me/" + n));
                i2.setPackage("com.whatsapp.w4b");
                i2.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e2) {
                call.reject("WhatsApp not installed");
            }
        }
    }

    // ==================== PERMISSIONS (unchanged) ====================

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState(CALL_PERMISSION_ALIAS) == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState(CALL_PERMISSION_ALIAS) == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias(CALL_PERMISSION_ALIAS, call, "onRequestPermissionResult");
        }
    }

    @PermissionCallback
    private void onRequestPermissionResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState(CALL_PERMISSION_ALIAS) == PermissionState.GRANTED);
        call.resolve(ret);
    }

    // ==================== CALL WAITING ====================

    @PluginMethod
    public void startCallWaitingListener(PluginCall call) {
        if (telephonyManager == null) {
            telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        }

        createNotificationChannel();

        callWaitingListener = new PhoneStateListener() {
            @Override
            public void onCallStateChanged(int state, String phoneNumber) {
                Log.d("NEON_CALL_WAITING", "State: " + state + ", number: " + phoneNumber + ", wasOffHook: " + wasOffHook);
                if (state == TelephonyManager.CALL_STATE_OFFHOOK) {
                    wasOffHook = true;
                } else if (state == TelephonyManager.CALL_STATE_RINGING && wasOffHook) {
                    playCallWaitingTone();
                    showCallWaitingNotification(phoneNumber);
                } else if (state == TelephonyManager.CALL_STATE_IDLE) {
                    wasOffHook = false;
                    cancelCallWaitingNotification();
                }
            }
        };

        telephonyManager.listen(callWaitingListener, PhoneStateListener.LISTEN_CALL_STATE);
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopCallWaitingListener(PluginCall call) {
        if (callWaitingListener != null && telephonyManager != null) {
            telephonyManager.listen(callWaitingListener, PhoneStateListener.LISTEN_NONE);
            callWaitingListener = null;
        }
        cancelCallWaitingNotification();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private void createNotificationChannel() {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Call Waiting", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notifies when a second call comes in while on a call");
            manager.createNotificationChannel(channel);
        }
    }

    private void playCallWaitingTone() {
        new Thread(() -> {
            ToneGenerator toneGen = null;
            try {
                toneGen = new ToneGenerator(AudioManager.STREAM_MUSIC, 80);
                for (int i = 0; i < 3; i++) {
                    toneGen.startTone(ToneGenerator.TONE_SUP_CALL_WAITING, 500);
                    Thread.sleep(1000);
                }
            } catch (Exception e) {
                Log.e("NEON_CALL_WAITING", "Tone error: " + e.getMessage());
            } finally {
                if (toneGen != null) toneGen.release();
            }
        }).start();
    }

    private void showCallWaitingNotification(String phoneNumber) {
        String displayNumber = phoneNumber != null && !phoneNumber.isEmpty() ? phoneNumber : "Unknown";
        Intent intent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
        int flag = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flag |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(getContext(), 0, intent, flag);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("Second call from " + displayNumber)
                .setContentText("Tap to Hold & Answer / Not taking the call")
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private void cancelCallWaitingNotification() {
        try {
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            manager.cancel(NOTIFICATION_ID);
        } catch (Exception e) {
            // ignore
        }
    }
}
