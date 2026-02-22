from django.contrib.auth.views import LoginView
from django.urls import reverse_lazy
from django.views.generic import CreateView
from django.contrib import messages
from django.shortcuts import redirect
from .models import CustomUser
from .forms import CustomUserCreationForm


class CustomLoginView(LoginView):
    """Кастомная страница входа"""
    template_name = 'users/login.html'
    redirect_authenticated_user = True

    def form_valid(self, form):
        messages.success(self.request,
                         f'Добро пожаловать, {form.get_user().get_full_name() or form.get_user().username}!')
        return super().form_valid(form)

    def get_success_url(self):
        return reverse_lazy('core:dashboard')

    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect('core:dashboard')
        return super().get(request, *args, **kwargs)


class RegisterView(CreateView):
    """Регистрация нового пользователя"""
    model = CustomUser
    form_class = CustomUserCreationForm
    template_name = 'users/register.html'  # Отдельный шаблон для регистрации
    success_url = reverse_lazy('users:login')

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, 'Регистрация успешна! Теперь войдите в систему')
        return response

    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            return redirect('core:dashboard')
        return super().get(request, *args, **kwargs)