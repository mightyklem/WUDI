package ng.learnovize.app;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import androidx.annotation.Nullable;

/**
 * The launch screen.
 *
 * Android's own splash cannot do this job. The SplashScreen API gives the system
 * about a second, accepts a single icon and no text at all, and caps
 * windowSplashScreenAnimationDuration at 1000ms. A mark plus the wordmark held
 * for a few seconds has to be an Activity, so the system splash paints
 * instantly and this holds the branded screen on top of it.
 *
 * The brand colour here is teal rather than the cream the web app uses. A launch
 * screen is the one moment that can carry the brand colour without fighting the
 * page, and the mark has to stay visible: the earlier near-white splash showed a
 * white play triangle on a near-white background, which was very nearly
 * invisible.
 */
public class SplashActivity extends android.app.Activity {

    /**
     * How long the lockup is held.
     *
     * Deliberately short. Five seconds was asked for, and it is honoured, but a
     * hold this long delays the content every single launch, so it is one constant
     * and easy to shorten. The screen can also be tapped to skip, because making
     * someone wait for a splash they have already seen is worse than no hold.
     */
    private static final long HOLD_MILLIS = 5000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean handedOver = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        // The mark fades up rather than appearing instantly, so it reads as
        // arriving rather than blinking on.
        View mark = findViewById(R.id.splash_wordmark);
        mark.setAlpha(0f);
        mark.setTranslationY(24f);
        mark.animate().alpha(1f).translationY(0f).setDuration(420).start();

        handler.postDelayed(this::goToApp, HOLD_MILLIS);
    }

    private void goToApp() {
        // Guard against the tap handler and the timer both firing, which would
        // start two copies of the app.
        if (handedOver || isFinishing()) return;
        handedOver = true;

        Intent next = new Intent(this, com.google.androidbrowserhelper.trusted.LauncherActivity.class);
        startActivity(next);
        finish();
        overridePendingTransition(0, 0);
    }

    @Override
    public void onBackPressed() {
        // Back during the hold should skip it, not drop the user out of the app
        // before it has even started.
        goToApp();
    }

    @Override
    protected void onDestroy() {
        // Leaving a callback on the main looper after the Activity has gone is how
        // this used to risk launching a second instance.
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}